// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IDAOFrameworks
 * @notice Interfaces for integrating Epistemic Governor with established DAO frameworks:
 * - OpenZeppelin Governor (IGovernorStandard)
 * - Gnosis Safe / Zodiac (IZodiacModule)
 * - Aragon OSx (IAragonPlugin)
 * - OpenZeppelin / Compound Timelock (ITimelockController)
 */

interface IGovernorStandard {
    enum ProposalState {
        Pending,
        Active,
        Canceled,
        Defeated,
        Succeeded,
        Queued,
        Expired,
        Executed
    }

    function name() external view returns (string memory);
    function version() external view returns (string memory);
    function state(bytes32 proposalId) external view returns (ProposalState);
    function proposalVotes(bytes32 proposalId) external view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes);
    function proposalDeadline(bytes32 proposalId) external view returns (uint256);
    function proposalSnapshot(bytes32 proposalId) external view returns (uint256);
    function quorum(uint256 timepoint) external view returns (uint256);
}

interface IZodiacModule {
    enum Operation { Call, DelegateCall }
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes memory data,
        Operation operation
    ) external returns (bool success);
}

interface IAragonPlugin {
    function executeProposalHook(
        bytes32 proposalId,
        bytes calldata metadata,
        bytes[] calldata actions
    ) external returns (bool success);
}

interface ITimelockController {
    function schedule(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) external;

    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) external payable;
}

interface IEnDAOsmentGovernorGeneral {
    enum ProposalStage {
        Pending,
        Approval,
        Quadratic,
        Succeeded,
        Queued,
        Executed,
        Defeated,
        Canceled
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) external returns (uint256);

    function castApprovalVote(
        uint256 proposalId,
        uint8 support,
        uint256 tokenId
    ) external returns (uint256);

    function castQuadraticVote(
        uint256 proposalId,
        uint8 support,
        uint256 creditsToSpend,
        uint256 tokenId
    ) external returns (uint256);

    function advanceToQuadratic(uint256 proposalId) external;
    function finalizeQuadratic(uint256 proposalId) external;
    function state(uint256 proposalId) external view returns (ProposalStage);
}

interface ICrsManager {
    function getCrs(address account, uint256 tokenId) external view returns (uint256);
    function getPastCrs(address account, uint256 tokenId, uint256 timepoint) external view returns (uint256);
}


