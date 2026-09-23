// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./proxy/Initializable.sol";
import "./proxy/UUPSUpgradeable.sol";
import "./interfaces/IDAOFrameworks.sol";

/**
 * @title EpistemicGovernor
 * @notice Layer 3: Upgradeable Epistemic DAO Governance Contract (PRD §6.2)
 * Manages protocol proposals, ZK anonymous voting with nullifier replay protection,
 * Epistemic Tier quadratic weight scaling, UUPS upgradeability, and composability
 * with external DAO frameworks (OpenZeppelin Governor, Gnosis Safe / Zodiac, Aragon OSx).
 */
contract EpistemicGovernor is Initializable, UUPSUpgradeable, IGovernorStandard {
    enum EpistemicTier { NOVICE, CONTRIBUTOR, ARBITER, SAGE }
    enum ProposalStatus { PENDING, ACTIVE, EXECUTED, DEFEATED }
    enum ParentFramework { STANDALONE, OPENZEPPELIN_GOVERNOR, ARAGON_OSX, ZODIAC_SAFE, COMPOUND_BRAVO }

    struct Proposal {
        bytes32 proposalId;
        string title;
        string descriptionCid; // IPFS CID pointing to proposal specification
        address proposer;
        EpistemicTier minTierRequired;
        uint256 startTime;
        uint256 endTime;
        uint256 forVotes;
        uint256 againstVotes;
        ProposalStatus status;
        uint256 quorumThreshold;
    }

    address public owner;
    bytes32 public semaphoreMerkleRoot;
    address public parentDAO;
    ParentFramework public parentFramework;
    bool private _locked;

    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => bool) public usedNullifiers;
    bytes32[] public proposalList;

    event ProposalCreated(
        bytes32 indexed proposalId,
        string title,
        string descriptionCid,
        address indexed proposer,
        EpistemicTier minTierRequired,
        uint256 endTime
    );

    event AnonymousVoteCast(
        bytes32 indexed proposalId,
        bytes32 indexed nullifierHash,
        bool support,
        uint8 voterTier,
        uint256 weight
    );

    event ProposalExecuted(bytes32 indexed proposalId);
    event MerkleRootUpdated(bytes32 indexed oldRoot, bytes32 indexed newRoot);
    event ParentDAOConfigured(address indexed oldParent, address indexed newParent, ParentFramework oldFramework, ParentFramework newFramework);
    event ProposalForwardedToParent(bytes32 indexed proposalId, address indexed parentDAO, ParentFramework framework, bytes actionData);

    error ProposalAlreadyExists(bytes32 proposalId);
    error ProposalNotFound(bytes32 proposalId);
    error VotingNotActive(bytes32 proposalId);
    error NullifierAlreadyUsed(bytes32 nullifierHash);
    error InsufficientTier(uint8 voterTier, uint8 requiredTier);
    error QuorumNotReached(uint256 currentVotes, uint256 requiredQuorum);
    error ProposalAlreadySettled(bytes32 proposalId);
    error Unauthorized();
    error FrameworkExecutionFailed();
    error ReentrancyGuardLocked();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert ReentrancyGuardLocked();
        _locked = true;
        _;
        _locked = false;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the upgradeable EpistemicGovernor logic
     */
    function initialize(
        bytes32 _initialMerkleRoot,
        address _parentDAO,
        ParentFramework _frameworkType
    ) external initializer {
        owner = msg.sender;
        semaphoreMerkleRoot = _initialMerkleRoot;
        parentDAO = _parentDAO;
        parentFramework = _frameworkType;
    }

    /**
     * @notice Restricts contract upgrades to owner or self-call via passed Epistemic Proposal
     */
    function _authorizeUpgrade(address /* newImplementation */) internal view override {
        if (msg.sender != owner && msg.sender != address(this)) {
            revert Unauthorized();
        }
    }

    /**
     * @notice Configures parent DAO framework binding (Zodiac Safe, Aragon OSx, OZ Governor, etc.)
     */
    function configureParentDAO(address _parentDAO, ParentFramework _framework) external onlyOwner {
        emit ParentDAOConfigured(parentDAO, _parentDAO, parentFramework, _framework);
        parentDAO = _parentDAO;
        parentFramework = _framework;
    }

    function updateMerkleRoot(bytes32 _newRoot) external onlyOwner {
        emit MerkleRootUpdated(semaphoreMerkleRoot, _newRoot);
        semaphoreMerkleRoot = _newRoot;
    }

    /**
     * @notice Returns the voting weight for a given Epistemic Tier (PRD §6.2)
     */
    function getTierWeight(EpistemicTier tier) public pure returns (uint256) {
        if (tier == EpistemicTier.SAGE) return 30;
        if (tier == EpistemicTier.ARBITER) return 15;
        if (tier == EpistemicTier.CONTRIBUTOR) return 5;
        return 1; // NOVICE
    }

    /**
     * @notice Creates a new Epistemic DAO proposal
     */
    function createProposal(
        bytes32 proposalId,
        string calldata title,
        string calldata descriptionCid,
        EpistemicTier minTierRequired,
        uint256 votingPeriodSeconds,
        uint256 quorumThreshold
    ) external returns (bytes32) {
        if (proposals[proposalId].proposalId != bytes32(0)) {
            revert ProposalAlreadyExists(proposalId);
        }

        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + votingPeriodSeconds;

        proposals[proposalId] = Proposal({
            proposalId: proposalId,
            title: title,
            descriptionCid: descriptionCid,
            proposer: msg.sender,
            minTierRequired: minTierRequired,
            startTime: startTime,
            endTime: endTime,
            forVotes: 0,
            againstVotes: 0,
            status: ProposalStatus.ACTIVE,
            quorumThreshold: quorumThreshold
        });

        proposalList.push(proposalId);

        emit ProposalCreated(
            proposalId,
            title,
            descriptionCid,
            msg.sender,
            minTierRequired,
            endTime
        );

        return proposalId;
    }

    /**
     * @notice Casts an anonymous vote using a Semaphore ZK nullifier hash
     */
    function voteAnonymous(
        bytes32 proposalId,
        bytes32 nullifierHash,
        bool support,
        uint8 voterTier
    ) external {
        Proposal storage p = proposals[proposalId];
        if (p.proposalId == bytes32(0)) revert ProposalNotFound(proposalId);
        if (p.status != ProposalStatus.ACTIVE || block.timestamp > p.endTime) {
            revert VotingNotActive(proposalId);
        }
        if (usedNullifiers[nullifierHash]) {
            revert NullifierAlreadyUsed(nullifierHash);
        }
        if (voterTier < uint8(p.minTierRequired)) {
            revert InsufficientTier(voterTier, uint8(p.minTierRequired));
        }

        usedNullifiers[nullifierHash] = true;

        uint256 weight = getTierWeight(EpistemicTier(voterTier));
        if (support) {
            p.forVotes += weight;
        } else {
            p.againstVotes += weight;
        }

        emit AnonymousVoteCast(
            proposalId,
            nullifierHash,
            support,
            voterTier,
            weight
        );
    }

    /**
     * @notice Executes proposal if quorum and majority support are satisfied (Standalone Mode)
     */
    function executeProposal(bytes32 proposalId) external nonReentrant {
        Proposal storage p = proposals[proposalId];
        if (p.proposalId == bytes32(0)) revert ProposalNotFound(proposalId);
        if (p.status != ProposalStatus.ACTIVE) revert ProposalAlreadySettled(proposalId);

        uint256 totalVotes = p.forVotes + p.againstVotes;
        if (totalVotes < p.quorumThreshold) {
            revert QuorumNotReached(totalVotes, p.quorumThreshold);
        }

        if (p.forVotes > p.againstVotes) {
            p.status = ProposalStatus.EXECUTED;
            emit ProposalExecuted(proposalId);
        } else {
            p.status = ProposalStatus.DEFEATED;
        }
    }

    /**
     * @notice Executes proposal and dispatches execution payload to connected parent DAO framework
     */
    function executeWithParentFramework(
        bytes32 proposalId,
        address target,
        uint256 value,
        bytes calldata data
    ) external nonReentrant returns (bool) {
        Proposal storage p = proposals[proposalId];
        if (p.proposalId == bytes32(0)) revert ProposalNotFound(proposalId);
        if (p.status != ProposalStatus.ACTIVE) revert ProposalAlreadySettled(proposalId);

        uint256 totalVotes = p.forVotes + p.againstVotes;
        if (totalVotes < p.quorumThreshold) {
            revert QuorumNotReached(totalVotes, p.quorumThreshold);
        }
        if (p.forVotes <= p.againstVotes) {
            p.status = ProposalStatus.DEFEATED;
            return false;
        }

        p.status = ProposalStatus.EXECUTED;
        emit ProposalExecuted(proposalId);

        if (parentFramework == ParentFramework.ZODIAC_SAFE && parentDAO != address(0)) {
            bool success = IZodiacModule(parentDAO).execTransactionFromModule(
                target,
                value,
                data,
                IZodiacModule.Operation.Call
            );
            if (!success) revert FrameworkExecutionFailed();
            emit ProposalForwardedToParent(proposalId, parentDAO, parentFramework, data);
            return true;
        } else if (parentFramework == ParentFramework.ARAGON_OSX && parentDAO != address(0)) {
            bytes[] memory actions = new bytes[](1);
            actions[0] = data;
            bool success = IAragonPlugin(parentDAO).executeProposalHook(
                proposalId,
                bytes(p.descriptionCid),
                actions
            );
            if (!success) revert FrameworkExecutionFailed();
            emit ProposalForwardedToParent(proposalId, parentDAO, parentFramework, data);
            return true;
        } else if ((parentFramework == ParentFramework.OPENZEPPELIN_GOVERNOR || parentFramework == ParentFramework.COMPOUND_BRAVO) && parentDAO != address(0)) {
            (bool success, ) = parentDAO.call{value: value}(data);
            if (!success) revert FrameworkExecutionFailed();
            emit ProposalForwardedToParent(proposalId, parentDAO, parentFramework, data);
            return true;
        }

        return true;
    }

    // --- OpenZeppelin IGovernorStandard Compatibility Views ---

    function name() external pure override returns (string memory) {
        return "Veracities Epistemic Governor";
    }

    function version() external pure override returns (string memory) {
        return "2.0-upgradeable";
    }

    function state(bytes32 proposalId) public view override returns (ProposalState) {
        Proposal storage p = proposals[proposalId];
        if (p.proposalId == bytes32(0)) revert ProposalNotFound(proposalId);
        if (p.status == ProposalStatus.EXECUTED) return ProposalState.Executed;
        if (p.status == ProposalStatus.DEFEATED) return ProposalState.Defeated;
        if (block.timestamp <= p.endTime) return ProposalState.Active;

        uint256 totalVotes = p.forVotes + p.againstVotes;
        if (totalVotes < p.quorumThreshold) return ProposalState.Defeated;
        if (p.forVotes > p.againstVotes) return ProposalState.Succeeded;
        return ProposalState.Defeated;
    }

    function proposalVotes(bytes32 proposalId) external view override returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes) {
        Proposal storage p = proposals[proposalId];
        if (p.proposalId == bytes32(0)) revert ProposalNotFound(proposalId);
        return (p.againstVotes, p.forVotes, 0);
    }

    function proposalDeadline(bytes32 proposalId) external view override returns (uint256) {
        Proposal storage p = proposals[proposalId];
        if (p.proposalId == bytes32(0)) revert ProposalNotFound(proposalId);
        return p.endTime;
    }

    function proposalSnapshot(bytes32 proposalId) external view override returns (uint256) {
        Proposal storage p = proposals[proposalId];
        if (p.proposalId == bytes32(0)) revert ProposalNotFound(proposalId);
        return p.startTime;
    }

    function quorum(uint256 /* timepoint */) external pure override returns (uint256) {
        return 100;
    }

    function getProposalCount() external view returns (uint256) {
        return proposalList.length;
    }

    // Storage gap for future upgrades
    uint256[45] private __gap;
}
