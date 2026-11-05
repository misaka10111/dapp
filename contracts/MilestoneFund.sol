// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MilestoneFund Lite - two-stage, contribution-weighted crowdfunding.
/// @notice Educational prototype. No owner, admin withdrawal, or fee. Anyone can
/// release an approved milestone. Only the creator can claim the released payout.
contract MilestoneFund {
    enum ProjectStatus { Funding, Successful, Failed, Completed, Expired }

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
        uint256 successfulAt;
    }

    struct Milestone {
        string goal;
        string evidence;
        string evidenceUrl;
        uint256 approvalWeight;
        // The amount released from escrow, including funds credited for later claim.
        uint256 withdrawnAmount;
        uint256 submittedAt;
        bool submitted;
        bool approved;
        bool withdrawn;
    }

    /// @notice How long backers have to approve after evidence is submitted.
    /// @dev Fixed at deployment and immutable afterwards, so the rules cannot be
    /// changed later by anyone. A short value is useful for demos.
    uint256 public immutable APPROVAL_TIMEOUT;
    /// @notice How long the creator has to submit evidence after each milestone opens.
    uint256 public immutable SUBMISSION_TIMEOUT;

    uint256 public projectCount;
    mapping(uint256 => Project) private projects;
    mapping(uint256 => Milestone[2]) private milestones;
    mapping(uint256 => mapping(address => uint256)) public contributions;
    mapping(uint256 => mapping(uint8 => mapping(address => bool))) public hasApproved;
    mapping(uint256 => mapping(address => bool)) public refunded;
    bool private entered;
    mapping(uint256 => uint256) private expiredRefundPools;
    mapping(uint256 => uint256) private secondMilestoneOpenedAt;
    mapping(uint256 => uint256) public claimablePayouts;

    event ProjectCreated(uint256 indexed projectId, address indexed creator, uint256 target, uint256 deadline);
    event ContributionReceived(uint256 indexed projectId, address indexed backer, uint256 amount);
    event FundingSuccessful(uint256 indexed projectId, uint256 totalRaised);
    event FundingFailed(uint256 indexed projectId);
    event EvidenceSubmitted(uint256 indexed projectId, uint8 indexed milestone, string evidence, string evidenceUrl);
    event ApprovalCast(uint256 indexed projectId, uint8 indexed milestone, address indexed backer, uint256 weight);
    event MilestoneApproved(uint256 indexed projectId, uint8 indexed milestone);
    event MilestoneReleased(uint256 indexed projectId, uint8 indexed milestone, uint256 amount);
    event FundsWithdrawn(uint256 indexed projectId, uint8 indexed milestone, uint256 amount);
    event PayoutClaimed(uint256 indexed projectId, address indexed recipient, uint256 amount);
    event ProjectCompleted(uint256 indexed projectId);
    event RefundClaimed(uint256 indexed projectId, address indexed backer, uint256 amount);
    event ExcessRefunded(uint256 indexed projectId, address indexed backer, uint256 amount);
    event ProjectExpired(uint256 indexed projectId);

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

    /// @param approvalTimeout seconds backers have to approve submitted evidence
    /// @param submissionTimeout seconds the creator has to submit evidence
    constructor(uint256 approvalTimeout, uint256 submissionTimeout) {
        require(approvalTimeout > 0 && approvalTimeout <= 30 days, "Invalid approval timeout");
        require(submissionTimeout > 0 && submissionTimeout <= 30 days, "Invalid submission timeout");
        APPROVAL_TIMEOUT = approvalTimeout;
        SUBMISSION_TIMEOUT = submissionTimeout;
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
        projects[projectId] = Project(payable(msg.sender), name, description, target, deadline, 0, 0, ProjectStatus.Funding, 0, 0);
        milestones[projectId][0].goal = firstGoal;
        milestones[projectId][1].goal = secondGoal;
        emit ProjectCreated(projectId, msg.sender, target, deadline);
    }

    /// @notice Contributions are capped at the target. Anything above the remaining
    /// amount is returned in the same transaction, so totalRaised never exceeds target.
    function contribute(uint256 projectId) external payable validProject(projectId) nonReentrant {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Funding, "Funding closed");
        require(block.timestamp < p.deadline, "Deadline reached");
        require(msg.sender != p.creator, "Creator cannot contribute");
        require(msg.value > 0, "Contribution must be positive");
        uint256 remaining = p.target - p.totalRaised;
        uint256 accepted = msg.value > remaining ? remaining : msg.value;
        uint256 excess = msg.value - accepted;
        contributions[projectId][msg.sender] += accepted;
        p.totalRaised += accepted;
        p.escrowBalance += accepted;
        emit ContributionReceived(projectId, msg.sender, accepted);
        // Accounting is committed before the external call; a failed refund reverts everything.
        if (excess > 0) {
            (bool ok,) = payable(msg.sender).call{value: excess}("");
            require(ok, "Excess refund failed");
            emit ExcessRefunded(projectId, msg.sender, excess);
        }
        if (p.totalRaised == p.target) {
            p.successfulAt = block.timestamp;
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
        require(block.timestamp < _milestoneDeadline(projectId, p, m), "Submission window closed");
        require(bytes(evidence).length > 0 && bytes(evidence).length <= 4000, "Invalid evidence");
        require(bytes(evidenceUrl).length > 0 && bytes(evidenceUrl).length <= 1000, "Invalid evidence URL");
        m.evidence = evidence;
        m.evidenceUrl = evidenceUrl;
        m.submitted = true;
        m.submittedAt = block.timestamp;
        emit EvidenceSubmitted(projectId, milestone, evidence, evidenceUrl);
    }

    function approveMilestone(uint256 projectId, uint8 milestone) external validProject(projectId) {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Successful, "Project not successful");
        require(milestone < 2 && milestone == p.currentMilestone, "Wrong milestone");
        Milestone storage m = milestones[projectId][milestone];
        require(m.submitted && !m.approved, "Approval not open");
        require(block.timestamp < _milestoneDeadline(projectId, p, m), "Approval window closed");
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

    /// @notice Release and pay an approved milestone to the creator in one transaction.
    function withdrawMilestone(uint256 projectId, uint8 milestone) external validProject(projectId) nonReentrant {
        Project storage p = projects[projectId];
        require(msg.sender == p.creator, "Creator only");
        uint256 amount = _releaseMilestone(projectId, milestone, p);
        emit FundsWithdrawn(projectId, milestone, amount);
        if (milestone == 1) emit ProjectCompleted(projectId);
        _sendPayout(p.creator, amount);
    }

    /// @notice Advance an approved milestone and credit its payout without sending ETH.
    function releaseMilestone(uint256 projectId, uint8 milestone) external validProject(projectId) nonReentrant {
        uint256 amount = _releaseMilestone(projectId, milestone, projects[projectId]);
        claimablePayouts[projectId] += amount;
        emit MilestoneReleased(projectId, milestone, amount);
        if (milestone == 1) emit ProjectCompleted(projectId);
    }

    /// @notice The creator can collect the project's released payouts at a chosen address.
    function claimPayout(uint256 projectId, address payable recipient) external validProject(projectId) nonReentrant {
        require(msg.sender == projects[projectId].creator, "Creator only");
        require(recipient != address(0), "Invalid payout recipient");
        uint256 amount = claimablePayouts[projectId];
        require(amount > 0, "No payout available");
        claimablePayouts[projectId] = 0;
        emit PayoutClaimed(projectId, recipient, amount);
        _sendPayout(recipient, amount);
    }

    function _releaseMilestone(uint256 projectId, uint8 milestone, Project storage p)
        private returns (uint256 amount)
    {
        require(p.status == ProjectStatus.Successful, "Project not successful");
        require(milestone < 2 && milestone == p.currentMilestone, "Wrong milestone");
        Milestone storage m = milestones[projectId][milestone];
        require(m.approved && !m.withdrawn, "Milestone not withdrawable");
        // floor(total * 2 / 5), split into quotient and remainder to avoid overflow.
        amount = milestone == 0
            ? (p.totalRaised / 5) * 2 + (p.totalRaised % 5) * 2 / 5
            : p.escrowBalance;
        m.withdrawn = true;
        m.withdrawnAmount = amount;
        p.escrowBalance -= amount;
        p.currentMilestone++;
        if (milestone == 0) {
            secondMilestoneOpenedAt[projectId] = block.timestamp;
        } else {
            p.status = ProjectStatus.Completed;
        }
    }

    function _sendPayout(address payable recipient, uint256 amount) private {
        if (amount == 0) return;
        (bool sent,) = recipient.call{value: amount}("");
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

    /// @notice Reclaim a share of the remaining escrow when the current milestone times
    /// out: either backers did not approve submitted evidence, or the creator never
    /// submitted it. Each share uses the same pool, frozen before the first refund.
    function claimExpiredRefund(uint256 projectId) external validProject(projectId) nonReentrant {
        Project storage p = projects[projectId];
        string memory blocker = _expiredRefundBlocker(projectId, p);
        require(bytes(blocker).length == 0, blocker);
        uint256 amount = _expiredRefundAmount(projectId, p, msg.sender);
        require(amount > 0, "No refund available");

        refunded[projectId][msg.sender] = true;
        if (p.status == ProjectStatus.Successful) {
            expiredRefundPools[projectId] = p.escrowBalance;
            p.status = ProjectStatus.Expired;
            emit ProjectExpired(projectId);
        }
        p.escrowBalance -= amount;
        emit RefundClaimed(projectId, msg.sender, amount);
        (bool sent,) = payable(msg.sender).call{value: amount}("");
        require(sent, "ETH transfer failed");
    }

    /// @notice Returns the claimable expiry refund in wei, or zero if none is available.
    function getExpiredRefundAmount(uint256 projectId, address backer)
        external view validProject(projectId) returns (uint256)
    {
        Project storage p = projects[projectId];
        if (bytes(_expiredRefundBlocker(projectId, p)).length != 0) return 0;
        return _expiredRefundAmount(projectId, p, backer);
    }

    /// @notice The current submission or approval deadline and whether the window is open.
    /// @dev A zero deadline means there is no pending submission or approval.
    function getMilestoneWindow(uint256 projectId)
        external view validProject(projectId) returns (uint256 deadline, bool open)
    {
        Project storage p = projects[projectId];
        if (p.status != ProjectStatus.Successful && p.status != ProjectStatus.Expired) return (0, false);
        Milestone storage m = milestones[projectId][p.currentMilestone];
        if (m.approved) return (0, false);
        deadline = _milestoneDeadline(projectId, p, m);
        open = block.timestamp < deadline;
    }

    function _expiredRefundBlocker(uint256 projectId, Project storage p) private view returns (string memory) {
        if (p.status != ProjectStatus.Successful && p.status != ProjectStatus.Expired) return "Project not active";
        if (p.currentMilestone >= 2) return "Project completed";
        Milestone storage m = milestones[projectId][p.currentMilestone];
        if (m.approved) return "Milestone already approved";
        if (block.timestamp < _milestoneDeadline(projectId, p, m)) {
            return m.submitted ? "Approval window still open" : "Submission window still open";
        }
        return "";
    }

    function _milestoneDeadline(uint256 projectId, Project storage p, Milestone storage m)
        private view returns (uint256)
    {
        if (m.submitted) return m.submittedAt + APPROVAL_TIMEOUT;
        uint256 openedAt = p.currentMilestone == 0 ? p.successfulAt : secondMilestoneOpenedAt[projectId];
        return openedAt + SUBMISSION_TIMEOUT;
    }

    function _expiredRefundAmount(uint256 projectId, Project storage p, address backer) private view returns (uint256) {
        if (refunded[projectId][backer]) return 0;
        uint256 pool = p.status == ProjectStatus.Expired ? expiredRefundPools[projectId] : p.escrowBalance;
        return contributions[projectId][backer] * pool / p.totalRaised;
    }

    function getProject(uint256 projectId) external view validProject(projectId) returns (Project memory) {
        return projects[projectId];
    }

    function getMilestone(uint256 projectId, uint8 milestone) external view validProject(projectId) returns (Milestone memory) {
        require(milestone < 2, "Invalid milestone");
        return milestones[projectId][milestone];
    }
}
