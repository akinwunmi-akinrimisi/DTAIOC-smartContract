// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPaymaster {
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint48 validUntil, uint48 validAfter);
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external;
}

interface IBasenameResolver {
    function resolve(address wallet) external view returns (string memory);
}

interface IEntryPoint {
    function balanceOf(address account) external view returns (uint256);
}

struct UserOperation {
    address sender;
    uint256 nonce;
    bytes callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes paymasterAndData;
}

enum PostOpMode { opExecuted, opReverted }

contract DTAIOCPaymaster is Ownable, ReentrancyGuard, IPaymaster {
    address public immutable entryPoint;
    address public immutable dtaiocToken;
    address public immutable dtaiocGame;
    address public basenameResolver;
    bool public isPaused;
    uint256 public maxGasLimit;
    uint256 public maxGasPrice;
    uint256 public maxSponsoredGas;
    uint256 public totalSponsoredGas;
    uint256 public avgGasUsed;
    uint256 public minSponsorshipInterval;
    uint256 public maxWithdrawalPerDay;
    uint256 public lastWithdrawalTime;
    mapping(address => uint256) public nonces;
    mapping(address => uint256) public lastSponsoredTime;

    bytes4 private constant MINT_SELECTOR = bytes4(keccak256("mint(uint256)"));
    bytes4 private constant JOIN_GAME_SELECTOR = bytes4(keccak256("joinGame(uint256,bytes,string)"));
    bytes4 private constant SUBMIT_ANSWERS_SELECTOR = bytes4(keccak256("submitAnswers(uint256,uint256,bytes32[],uint256,bytes)"));

    event ResolverUpdated(address indexed newResolver);
    event Paused();
    event Unpaused();
    event ConfigChanged(string param, uint256 value);
    event UserOperationSponsored(address indexed wallet, address indexed target, bytes4 functionSelector, uint256 gasUsed);
    event SponsorshipAttempt(address indexed wallet, bytes4 functionSelector, bool success, uint256 gasUsed);
    event ValidationFailed(address indexed wallet, string reason);
    event NonceUsed(address indexed wallet, uint256 nonce);
    event DepositReceived(address indexed sender, uint256 amount);
    event EthWithdrawn(address indexed recipient, uint256 amount);
    event LowBalanceWarning(uint256 balance);
    event AutoPausedHighGasPrice(uint256 gasPrice);
    event CircuitBreakerTriggered(address indexed wallet);

    modifier onlyEntryPoint() {
        require(msg.sender == entryPoint, "Only EntryPoint");
        _;
    }

    modifier notPaused() {
        require(!isPaused, "Paused");
        _;
    }

    modifier withinRateLimit(address wallet) {
        require(
            block.timestamp >= lastSponsoredTime[wallet] + minSponsorshipInterval,
            "RateLimitExceeded"
        );
        _;
    }

    constructor(
        address _entryPoint,
        address _dtaiocToken,
        address _dtaiocGame,
        address _basenameResolver
    ) Ownable(msg.sender) {
        require(_entryPoint != address(0), "Invalid EntryPoint");
        require(_dtaiocToken != address(0), "Invalid DTAIOCToken");
        require(_dtaiocGame != address(0), "Invalid DTAIOCGame");
        require(_basenameResolver != address(0), "Invalid Resolver");

        entryPoint = _entryPoint;
        dtaiocToken = _dtaiocToken;
        dtaiocGame = _dtaiocGame;
        basenameResolver = _basenameResolver;

        maxGasLimit = 200_000;
        maxGasPrice = 100 * 10**9;
        maxSponsoredGas = 10_000_000;
        minSponsorshipInterval = 60;
        maxWithdrawalPerDay = 1 ether;
        isPaused = false;
    }

    receive() external payable {
        emit DepositReceived(msg.sender, msg.value);
    }

    function withdraw(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        require(recipient != address(0), "Invalid Recipient");
        require(amount > 0, "Invalid Amount");

        // Enforce maxWithdrawalPerDay for all withdrawals
        require(amount <= maxWithdrawalPerDay, "WithdrawalLimitExceeded");

        // Update lastWithdrawalTime if within 24 hours or first withdrawal
        if (block.timestamp >= lastWithdrawalTime + 1 days) {
            lastWithdrawalTime = block.timestamp;
        }

        uint256 balance = address(this).balance;
        require(balance >= amount, "Insufficient Balance");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer Failed");

        emit EthWithdrawn(recipient, amount);
    }

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 /* userOpHash */,
        uint256 maxCost
    )
        external
        override
        onlyEntryPoint
        notPaused
        withinRateLimit(userOp.sender)
        returns (bytes memory context, uint48 validUntil, uint48 validAfter)
    {
        // Circuit breaker: Pause if too many UserOps from one wallet
        if (lastSponsoredTime[userOp.sender] > block.timestamp - 10) {
            isPaused = true;
            emit CircuitBreakerTriggered(userOp.sender);
            revert("CircuitBreakerTriggered");
        }

        if (userOp.maxFeePerGas > maxGasPrice) {
            isPaused = true;
            emit AutoPausedHighGasPrice(userOp.maxFeePerGas);
            emit ValidationFailed(userOp.sender, "HighGasPrice");
            revert("HighGasPrice");
        }

        uint256 totalGas = userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas;
        if (totalGas > maxGasLimit) {
            emit ValidationFailed(userOp.sender, "GasLimitExceeded");
            revert("GasLimitExceeded");
        }

        if (totalSponsoredGas + totalGas > maxSponsoredGas) {
            emit ValidationFailed(userOp.sender, "MaxSponsoredGasExceeded");
            revert("MaxSponsoredGasExceeded");
        }

        uint256 requiredBalance = maxCost;
        if (IEntryPoint(entryPoint).balanceOf(address(this)) < requiredBalance) {
            emit ValidationFailed(userOp.sender, "InsufficientFunds");
            emit LowBalanceWarning(IEntryPoint(entryPoint).balanceOf(address(this)));
            revert("InsufficientFunds");
        }

        // Extract target and nonce from paymasterAndData
        if (userOp.paymasterAndData.length < 52) { // 20 bytes (address) + 32 bytes (uint256)
            emit ValidationFailed(userOp.sender, "InvalidPaymasterData");
            revert("InvalidPaymasterData");
        }
        (address target, uint256 providedNonce) = abi.decode(userOp.paymasterAndData, (address, uint256));

        // Extract selector from callData
        if (userOp.callData.length < 4) {
            emit ValidationFailed(userOp.sender, "InvalidCallData");
            revert("InvalidCallData");
        }
        bytes4 selector = bytes4(userOp.callData);

        // Validate target and selector
        bool isValidTarget = false;
        if (target == dtaiocToken && selector == MINT_SELECTOR) {
            isValidTarget = true;
        } else if (target == dtaiocGame && (selector == JOIN_GAME_SELECTOR || selector == SUBMIT_ANSWERS_SELECTOR)) {
            isValidTarget = true;
        }
        if (!isValidTarget) {
            emit ValidationFailed(userOp.sender, "InvalidTargetOrFunction");
            revert("InvalidTargetOrFunction");
        }

        // Validate Basename
        try IBasenameResolver(basenameResolver).resolve(userOp.sender) returns (string memory basename) {
            if (bytes(basename).length == 0) {
                emit ValidationFailed(userOp.sender, "InvalidBasename");
                revert("InvalidBasename");
            }
        } catch {
            emit ValidationFailed(userOp.sender, "BasenameResolutionFailed");
            revert("BasenameResolutionFailed");
        }

        // Validate nonce
        uint256 expectedNonce = nonces[userOp.sender];
        if (providedNonce != expectedNonce) {
            emit ValidationFailed(userOp.sender, "InvalidNonce");
            revert("InvalidNonce");
        }
        nonces[userOp.sender]++;
        emit NonceUsed(userOp.sender, expectedNonce);

        lastSponsoredTime[userOp.sender] = block.timestamp;

        context = abi.encode(userOp.sender, target, selector, totalGas);
        validUntil = uint48(block.timestamp + 1 hours);
        validAfter = 0;
        emit SponsorshipAttempt(userOp.sender, selector, true, totalGas);
    }

    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external override onlyEntryPoint {
        (address wallet, address target, bytes4 selector) = abi.decode(context, (address, address, bytes4));
        uint256 actualGas = actualGasCost / (tx.gasprice > 0 ? tx.gasprice : 1 gwei);
        totalSponsoredGas += actualGas;
        avgGasUsed = actualGas;

        emit UserOperationSponsored(wallet, target, selector, actualGas);
        if (mode == PostOpMode.opReverted) {
            emit SponsorshipAttempt(wallet, selector, false, actualGas);
            revert("OpReverted");
        }
    }

    function pause() external onlyOwner {
        require(!isPaused, "Already Paused");
        isPaused = true;
        emit Paused();
    }

    function unpause() external onlyOwner {
        require(isPaused, "Not Paused");
        isPaused = false;
        emit Unpaused();
    }

    function setBasenameResolver(address newResolver) external onlyOwner {
        require(newResolver != address(0), "Invalid Resolver");
        basenameResolver = newResolver;
        emit ResolverUpdated(newResolver);
    }

    function setMaxGasLimit(uint256 newLimit) external onlyOwner {
        require(newLimit >= 50_000 && newLimit <= 500_000, "Invalid Gas Limit");
        maxGasLimit = newLimit;
        emit ConfigChanged("maxGasLimit", newLimit);
    }

    function setMaxGasPrice(uint256 newPrice) external onlyOwner {
        require(newPrice >= 10 * 10**9 && newPrice <= 500 * 10**9, "Invalid Gas Price");
        maxGasPrice = newPrice;
        emit ConfigChanged("maxGasPrice", newPrice);
    }

    function adjustMaxGasLimit() external onlyOwner {
        uint256 newLimit = avgGasUsed * 2;
        if (newLimit < 50_000) newLimit = 50_000;
        if (newLimit > 500_000) newLimit = 500_000;
        maxGasLimit = newLimit;
        emit ConfigChanged("maxGasLimit", newLimit);
    }

    function getBasenameStatus(address wallet) external view returns (bool hasValidBasename) {
        try IBasenameResolver(basenameResolver).resolve(wallet) returns (string memory basename) {
            return bytes(basename).length > 0;
        } catch {
            return false;
        }
    }
}