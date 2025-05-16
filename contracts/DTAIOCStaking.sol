// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IDTAIOCGame {
    function getPlayer(uint256 gameId, address player) external view returns (
        string memory basename,
        string memory twitterUsername,
        uint256 currentStage,
        uint256 score,
        uint256 completionTime
    );
    function isPerfectScore(uint256 gameId, address player, uint256 stage) external view returns (bool);
}

contract DTAIOCStaking is Ownable, ReentrancyGuard {
    // Custom errors for gas efficiency
    error InvalidAddress();
    error InvalidAmount();
    error StakingPaused();
    error UnauthorizedCaller();
    error NoStakeFound();
    error InvalidStage();
    error StageMismatch();
    error TransferFailed();
    error InvalidRefundPercentage();
    error NoForfeitedStakes();

    // State variables
    IERC20 public immutable token;
    address public gameContract;
    address public immutable platformAddress;
    bool public stakingPaused;

    // Mappings
    mapping(uint256 => mapping(address => uint256)) public playerStakes;
    mapping(uint256 => uint256) public totalStakes;
    mapping(uint256 => uint256) public forfeitedStakes;

    // Events
    event Staked(uint256 indexed gameId, address indexed player, uint256 amount);
    event Refunded(uint256 indexed gameId, address indexed player, uint256 stage, uint256 amount);
    event RewardsDistributed(uint256 indexed gameId, address indexed creator, address indexed platform, uint256 amount);
    event WinnerRewarded(uint256 indexed gameId, address indexed winner, uint256 amount);
    event GameContractSet(address indexed gameContract);
    event StakingPausedEvent();
    event StakingUnpausedEvent();

    constructor(address _token, address _platformAddress) Ownable(msg.sender) {
        if (_token == address(0)) revert InvalidAddress();
        if (_platformAddress == address(0)) revert InvalidAddress();
        token = IERC20(_token);
        platformAddress = _platformAddress;
        stakingPaused = false;
    }

    modifier onlyGameContract() {
        if (msg.sender != gameContract) revert UnauthorizedCaller();
        _;
    }

    modifier whenNotPaused() {
        if (stakingPaused) revert StakingPaused();
        _;
    }

    function setGameContract(address _gameContract) public onlyOwner {
        if (_gameContract == address(0)) revert InvalidAddress();
        gameContract = _gameContract;
        emit GameContractSet(_gameContract);
    }

    function pauseStaking() public onlyOwner {
        stakingPaused = true;
        emit StakingPausedEvent();
    }

    function unpauseStaking() public onlyOwner {
        stakingPaused = false;
        emit StakingUnpausedEvent();
    }

    function stake(uint256 gameId, address player, uint256 amount)
        public
        onlyGameContract
        whenNotPaused
        nonReentrant
    {
        if (amount == 0) revert InvalidAmount();
        if (!token.transferFrom(player, address(this), amount)) revert TransferFailed();
        playerStakes[gameId][player] += amount;
        totalStakes[gameId] += amount;
        emit Staked(gameId, player, amount);
    }

    function refund(uint256 gameId, address player, uint256 stage) public onlyGameContract nonReentrant {
        uint256 playerStake = playerStakes[gameId][player];
        if (playerStake == 0) return; // Skip refund if no stake
        if (stage < 1 || stage > 3) revert InvalidStage();

        (, , uint256 currentStage, uint256 score, ) = IDTAIOCGame(gameContract).getPlayer(gameId, player);
        if (currentStage != stage) revert StageMismatch();

        // Validate perfect score for stage 3
        bool isPerfect = IDTAIOCGame(gameContract).isPerfectScore(gameId, player, stage);
        uint256 refundPercentage;
        if (stage == 1) {
            refundPercentage = score == 5 ? 30 : 0;
        } else if (stage == 2) {
            refundPercentage = score == 5 ? 70 : 30;
        } else if (stage == 3) {
            refundPercentage = isPerfect ? 100 : 70;
        }

        if (refundPercentage > 100) revert InvalidRefundPercentage();

        uint256 refundAmount = (playerStake * refundPercentage) / 100;
        uint256 forfeitedAmount = playerStake - refundAmount;

        playerStakes[gameId][player] = 0;
        totalStakes[gameId] -= playerStake;
        forfeitedStakes[gameId] += forfeitedAmount;

        if (refundAmount > 0) {
            if (!token.transfer(player, refundAmount)) revert TransferFailed();
            emit Refunded(gameId, player, stage, refundAmount);
        }
    }

    function distributeRewards(uint256 gameId, address creator, address platform, address[] memory winners) 
        public 
        onlyGameContract 
        nonReentrant 
    {
        uint256 pool = forfeitedStakes[gameId];
        if (pool == 0) revert NoForfeitedStakes();
        forfeitedStakes[gameId] = 0;
        uint256 winnerShare = pool * 20 / 100;

        // Distribute to winners
        if (winners.length > 0) {
            _distributeWinnerShares(gameId, winners, winnerShare);
        }

        // Distribute to creator and platform
        if (winnerShare > 0) {
            if (!token.transfer(creator, winnerShare)) revert TransferFailed();
            if (!token.transfer(platform, winnerShare)) revert TransferFailed();
            emit RewardsDistributed(gameId, creator, platform, winnerShare);
        }
    }

    // Struct to track unique winners and shares
    struct WinnerInfo {
        address winner;
        uint256 share;
        bool processed;
    }

    function _distributeWinnerShares(uint256 gameId, address[] memory winners, uint256 winnerShare) private {
        WinnerInfo[] memory winnerInfos = new WinnerInfo[](3);
        uint256 uniqueCount = 0;

        // Track unique winners
        for (uint256 i = 0; i < winners.length && i < 3; i++) {
            address winner = winners[i];
            if (winner != address(0)) {
                bool found = false;
                for (uint256 j = 0; j < uniqueCount; j++) {
                    if (winnerInfos[j].winner == winner) {
                        winnerInfos[j].share += winnerShare;
                        found = true;
                        break;
                    }
                }
                if (!found && uniqueCount < 3) {
                    winnerInfos[uniqueCount] = WinnerInfo(winner, winnerShare, false);
                    uniqueCount++;
                }
            }
        }

        // Distribute to unique winners
        for (uint256 i = 0; i < uniqueCount; i++) {
            if (!winnerInfos[i].processed) {
                address winner = winnerInfos[i].winner;
                uint256 stakeReturn = playerStakes[gameId][winner];
                uint256 totalWinnerAmount = winnerInfos[i].share + stakeReturn;
                playerStakes[gameId][winner] = 0;
                totalStakes[gameId] -= stakeReturn;
                if (totalWinnerAmount > 0) {
                    if (!token.transfer(winner, totalWinnerAmount)) revert TransferFailed();
                    emit WinnerRewarded(gameId, winner, totalWinnerAmount);
                }
                winnerInfos[i].processed = true;
            }
        }
    }
}