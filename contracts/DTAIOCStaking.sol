// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract DTAIOCStaking is Ownable, ReentrancyGuard {
    IERC20 public token;
    address public gameContract;
    address public platformAddress;
    bool public stakingPaused;

    mapping(uint256 => mapping(address => uint256)) public playerStakes;
    mapping(uint256 => uint256) public totalStakes;
    mapping(uint256 => uint256) public forfeitedStakes;

    constructor(address _token, address _platformAddress) Ownable(msg.sender) {
        require(_token != address(0), "Invalid token address");
        require(_platformAddress != address(0), "Invalid platform address");
        token = IERC20(_token);
        platformAddress = _platformAddress;
    }

    modifier onlyGameContract() {
        require(msg.sender == gameContract, "Only game contract can call");
        _;
    }

    modifier whenNotPaused() {
        require(!stakingPaused, "Staking is paused");
        _;
    }

    function setGameContract(address _gameContract) public onlyOwner {
        require(_gameContract != address(0), "Invalid game contract address");
        gameContract = _gameContract;
    }

    function pauseStaking() public onlyOwner {
        stakingPaused = true;
    }

    function unpauseStaking() public onlyOwner {
        stakingPaused = false;
    }

    function stake(uint256 gameId, address player, uint256 amount)
        public
        onlyGameContract
        whenNotPaused
        nonReentrant
    {
        require(amount > 0, "Amount must be greater than 0");
        require(token.transferFrom(player, address(this), amount), "Transfer failed");
        playerStakes[gameId][player] += amount;
        totalStakes[gameId] += amount;
    }

    function refund(uint256 gameId, address player, uint256 stage)
        public
        onlyGameContract
        nonReentrant
    {
        uint256 playerStake = playerStakes[gameId][player];
        require(playerStake > 0, "No stake found");

        uint256 refundPercentage;
        if (stage == 1) refundPercentage = 0;
        else if (stage == 2) refundPercentage = 30;
        else if (stage == 3) refundPercentage = 70;
        else if (stage == 4) refundPercentage = 100;
        else revert("Invalid stage");

        uint256 refundAmount = (playerStake * refundPercentage) / 100;
        uint256 forfeitedAmount = playerStake - refundAmount;

        playerStakes[gameId][player] = 0;
        totalStakes[gameId] -= playerStake;
        forfeitedStakes[gameId] += forfeitedAmount;

        if (refundAmount > 0) {
            require(token.transfer(player, refundAmount), "Refund transfer failed");
        }
    }

    function distributeRewards(uint256 gameId, address creator, address[] memory winners)
        public
        onlyGameContract
        nonReentrant
    {
        require(winners.length == 3, "Must have 3 winners");
        uint256 pool = totalStakes[gameId]; // 17.0
        require(pool > 0, "No stakes to distribute");

        uint256 creatorShare = (pool * 20) / 100; // 20% = 3.4
        uint256 platformShare = (pool * 20) / 100; // 20% = 3.4
        uint256 winnerShare = (pool * 20) / 100; // 20% per winner = 3.4

        // Track winner shares to handle duplicates
        address[] memory uniqueWinners = new address[](3);
        uint256[] memory winnerShares = new uint256[](3);
        uint256 uniqueCount = 0;

        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] != address(0)) {
                bool found = false;
                for (uint256 j = 0; j < uniqueCount; j++) {
                    if (uniqueWinners[j] == winners[i]) {
                        winnerShares[j] = winnerShares[j] + winnerShare;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    uniqueWinners[uniqueCount] = winners[i];
                    winnerShares[uniqueCount] = winnerShare;
                    uniqueCount++;
                }
            }
        }

        totalStakes[gameId] = 0;
        forfeitedStakes[gameId] = 0;

        // Transfer creator and platform shares
        if (creatorShare > 0) {
            require(token.transfer(creator, creatorShare), "Creator transfer failed");
        }
        if (platformShare > 0) {
            require(token.transfer(platformAddress, platformShare), "Platform transfer failed");
        }

        // Transfer winner shares + stakes
        for (uint256 i = 0; i < winners.length; i++) {
            address winner = winners[i];
            if (winner != address(0) && winnerShares[i] > 0) {
                uint256 stakeReturn = playerStakes[gameId][winner];
                uint256 totalWinnerAmount = winnerShares[i] + stakeReturn;
                playerStakes[gameId][winner] = 0;
                if (totalWinnerAmount > 0) {
                    require(token.transfer(winner, totalWinnerAmount), "Winner transfer failed");
                }
                for (uint256 k = 0; k < uniqueCount; k++) {
                    if (uniqueWinners[k] == winner) {
                        delete winnerShares[k];
                        break;
                    }
                }
            }
        }
    }
}