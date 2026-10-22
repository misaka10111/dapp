// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "MilestoneFund.sol";

// Local-test fixture: verifies that a rejected ETH transfer rolls back accounting.
contract PaymentReceiver {
    MilestoneFund public immutable fund;
    bool public rejectPayments = true;

    constructor(address fundAddress) { fund = MilestoneFund(fundAddress); }

    function create(uint256 target, uint256 deadline) external {
        fund.createProject("Receiver project", "Transfer rollback test", target, deadline, "First", "Second");
    }
    function contribute(uint256 projectId) external payable { fund.contribute{value: msg.value}(projectId); }
    function evidence(uint256 projectId) external { fund.submitEvidence(projectId, 0, "Delivered", "https://example.com/demo"); }
    function withdraw(uint256 projectId) external { fund.withdrawMilestone(projectId, 0); }
    function refund(uint256 projectId) external { fund.claimRefund(projectId); }
    function allowPayments() external { rejectPayments = false; }
    receive() external payable { require(!rejectPayments, "Receiver rejected ETH"); }
}
