// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MilestoneFund Lite - two-stage, contribution-weighted crowdfunding.
/// @notice Educational prototype. Successful funds may remain locked indefinitely
/// if backers do not approve. No owner, admin withdrawal, fee, or voting timeout.
contract MilestoneFund {
    enum ProjectStatus { Funding, Successful, Failed, Completed }

    struct Project {
        address payable creator;
        string name;
        string description;
        uint256 target;
        uint256 deadline;
        uint256 totalRaised;
        uint256 escrowBalance;
        ProjectStatus status;
        uint8 currentMilestone;
    }

    struct Milestone {
        string goal;
        string evidence;
        string evidenceUrl;
        uint256 approvalWeight;
        uint256 withdrawnAmount;
        bool submitted;
        bool approved;
        bool withdrawn;
    }

    uint256 public projectCount;
    mapping(uint256 => Project) private projects;
    mapping(uint256 => Milestone[2]) private milestones;
    mapping(uint256 => mapping(address => uint256)) public contributions;
    mapping(uint256 => mapping(uint8 => mapping(address => bool))) public hasApproved;
    mapping(uint256 => mapping(address => bool)) public refunded;
    bool private entered;

    event ProjectCreated(uint256 indexed projectId, address indexed creator, uint256 target, uint256 deadline);
    event ContributionReceived(uint256 indexed projectId, address indexed backer, uint256 amount);
    event FundingSuccessful(uint256 indexed projectId, uint256 totalRaised);
    event FundingFailed(uint256 indexed projectId);
    event EvidenceSubmitted(uint256 indexed projectId, uint8 indexed milestone, string evidence, string evidenceUrl);
    event ApprovalCast(uint256 indexed projectId, uint8 indexed milestone, address indexed backer, uint256 weight);
    event MilestoneApproved(uint256 indexed projectId, uint8 indexed milestone);
    event FundsWithdrawn(uint256 indexed projectId, uint8 indexed milestone, uint256 amount);
    event ProjectCompleted(uint256 indexed projectId);
    event RefundClaimed(uint256 indexed projectId, address indexed backer, uint256 amount);

    modifier validProject(uint256 projectId) {
        require(projectId < projectCount, "Unknown project");
        _;
    }

    modifier nonReentrant() {
        require(!entered, "Reentrant call");
        entered = true;
        _;
        entered = false;
    }

    function createProject(
        string calldata name,
        string calldata description,
        uint256 target,
        uint256 deadline,
        string calldata firstGoal,
        string calldata secondGoal
    ) external returns (uint256 projectId) {
        require(bytes(name).length > 0 && bytes(name).length <= 120, "Invalid name");
        require(bytes(description).length > 0 && bytes(description).length <= 4000, "Invalid description");
        require(bytes(firstGoal).length > 0 && bytes(firstGoal).length <= 2000, "Invalid first goal");
        require(bytes(secondGoal).length > 0 && bytes(secondGoal).length <= 2000, "Invalid second goal");
        require(target > 0, "Target must be positive");
        require(deadline > block.timestamp, "Deadline must be future");
        projectId = projectCount++;
        projects[projectId] = Project(payable(msg.sender), name, description, target, deadline, 0, 0, ProjectStatus.Funding, 0);
        milestones[projectId][0].goal = firstGoal;
        milestones[projectId][1].goal = secondGoal;
        emit ProjectCreated(projectId, msg.sender, target, deadline);
    }

    /// @notice The last contribution may overshoot. Voting and budgets use totalRaised.
    function contribute(uint256 projectId) external payable validProject(projectId) {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Funding, "Funding closed");
        require(block.timestamp < p.deadline, "Deadline reached");
        require(msg.sender != p.creator, "Creator cannot contribute");
        require(msg.value > 0, "Contribution must be positive");
        contributions[projectId][msg.sender] += msg.value;
        p.totalRaised += msg.value;
        p.escrowBalance += msg.value;
        emit ContributionReceived(projectId, msg.sender, msg.value);
        if (p.totalRaised >= p.target) {
            p.status = ProjectStatus.Successful;
            emit FundingSuccessful(projectId, p.totalRaised);
        }
    }

    /// @notice Anyone may explicitly finalize an expired, unsuccessful campaign.
    function finalizeFunding(uint256 projectId) external validProject(projectId) {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Funding, "Funding closed");
        require(block.timestamp >= p.deadline, "Deadline not reached");
        p.status = ProjectStatus.Failed;
        emit FundingFailed(projectId);
    }

    function submitEvidence(uint256 projectId, uint8 milestone, string calldata evidence, string calldata evidenceUrl)
        external validProject(projectId)
    {
        Project storage p = projects[projectId];
        require(msg.sender == p.creator, "Creator only");
        require(p.status == ProjectStatus.Successful, "Project not successful");
        require(milestone < 2 && milestone == p.currentMilestone, "Wrong milestone");
        Milestone storage m = milestones[projectId][milestone];
        require(!m.submitted, "Evidence already submitted");
        require(bytes(evidence).length > 0 && bytes(evidence).length <= 4000, "Invalid evidence");
        require(bytes(evidenceUrl).length > 0 && bytes(evidenceUrl).length <= 1000, "Invalid evidence URL");
        m.evidence = evidence;
        m.evidenceUrl = evidenceUrl;
        m.submitted = true;
        emit EvidenceSubmitted(projectId, milestone, evidence, evidenceUrl);
    }

    function approveMilestone(uint256 projectId, uint8 milestone) external validProject(projectId) {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Successful, "Project not successful");
        require(milestone < 2 && milestone == p.currentMilestone, "Wrong milestone");
        Milestone storage m = milestones[projectId][milestone];
        require(m.submitted && !m.approved, "Approval not open");
        uint256 weight = contributions[projectId][msg.sender];
        require(weight > 0, "Backers only");
        require(!hasApproved[projectId][milestone][msg.sender], "Already approved");
        hasApproved[projectId][milestone][msg.sender] = true;
        m.approvalWeight += weight;
        emit ApprovalCast(projectId, milestone, msg.sender, weight);
        // Equivalent to weight * 2 > total, without multiplication overflow.
        if (m.approvalWeight > p.totalRaised / 2) {
            m.approved = true;
            emit MilestoneApproved(projectId, milestone);
        }
    }

    /// @notice First stage gets floor(totalRaised * 40 / 100); second gets remainder.
    function withdrawMilestone(uint256 projectId, uint8 milestone) external validProject(projectId) nonReentrant {
        Project storage p = projects[projectId];
        require(msg.sender == p.creator, "Creator only");
        require(p.status == ProjectStatus.Successful, "Project not successful");
        require(milestone < 2 && milestone == p.currentMilestone, "Wrong milestone");
        Milestone storage m = milestones[projectId][milestone];
        require(m.approved && !m.withdrawn, "Milestone not withdrawable");
        // floor(total * 2 / 5), split into quotient and remainder to avoid overflow.
        uint256 amount = milestone == 0
            ? (p.totalRaised / 5) * 2 + (p.totalRaised % 5) * 2 / 5
            : p.escrowBalance;
        m.withdrawn = true;
        m.withdrawnAmount = amount;
        p.escrowBalance -= amount;
        p.currentMilestone++;
        if (milestone == 1) p.status = ProjectStatus.Completed;
        emit FundsWithdrawn(projectId, milestone, amount);
        if (milestone == 1) emit ProjectCompleted(projectId);
        // All accounting is committed before the external call. Failure rolls it back.
        (bool sent,) = p.creator.call{value: amount}("");
        require(sent, "ETH transfer failed");
    }

    function claimRefund(uint256 projectId) external validProject(projectId) nonReentrant {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Failed, "Project not failed");
        uint256 amount = contributions[projectId][msg.sender];
        require(amount > 0 && !refunded[projectId][msg.sender], "No refund available");
        refunded[projectId][msg.sender] = true;
        p.escrowBalance -= amount;
        emit RefundClaimed(projectId, msg.sender, amount);
        (bool sent,) = payable(msg.sender).call{value: amount}("");
        require(sent, "ETH transfer failed");
    }

    function getProject(uint256 projectId) external view validProject(projectId) returns (Project memory) {
        return projects[projectId];
    }

    function getMilestone(uint256 projectId, uint8 milestone) external view validProject(projectId) returns (Milestone memory) {
        require(milestone < 2, "Invalid milestone");
        return milestones[projectId][milestone];
    }
}
