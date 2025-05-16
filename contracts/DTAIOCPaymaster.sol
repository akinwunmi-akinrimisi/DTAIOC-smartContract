// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IBasenameResolver.sol";
import "./BasePaymaster.sol";
import "./IEntryPoint.sol";
import "./MockSmartWallet.sol";

interface IDTAIOCGame {
    function createGame(
        string memory basename,
        string memory twitterUsername,
        bytes32[3] memory questionRootHashes,
        uint256 gameDuration,
        bytes memory signature
    ) external returns (uint256);

    function joinGame(
        uint256 gameId,
        string memory basename,
        string memory twitterUsername,
        bytes memory signature
    ) external;

    function submitAnswers(
        uint256 gameId,
        uint256 stage,
        bytes32[] memory answerHashes,
        uint256 score,
        bytes memory signature
    ) external;

    function mint(uint256 tokenId) external;
}

interface IMockSmartWallet {
    function verifySignature(bytes32 hash, bytes memory signature) external view returns (bool);
}

contract DTAIOCPaymaster is Ownable, ReentrancyGuard, BasePaymaster {
    error InvalidAddress();
    error PaymasterPaused();
    error InvalidCallData();
    error InvalidInnerCallData();
    error InvalidTargetContract();
    error NoRegisteredIdentifier();
    error InvalidIdentifier();
    error BasenameMismatch();
    error TwitterMismatch();
    error InsufficientDeposit();
    error WithdrawalFailed();
    error InvalidSignature();
    error InsufficientData(string action);

    address public platformAddress;
    address public tokenContract;
    address public stakingContract;
    address public nftContract;
    IDTAIOCGame public immutable gameContract;
    IBasenameResolver public immutable basenameResolver;
    bool public paused;

    mapping(address => uint256) public sponsoredUserOps;

    event UserOpSponsored(address indexed sender, bytes32 indexed userOpHash, string action);
    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event Paused();
    event Unpaused();
    event ValidationFailed(address indexed sender, string reason);

    constructor(
        address _entryPoint,
        address _platformAddress,
        address _gameContract,
        address _basenameResolver
    ) Ownable(msg.sender) BasePaymaster(IEntryPoint(_entryPoint)) {
        if (_entryPoint == address(0)) revert InvalidAddress();
        if (_platformAddress == address(0)) revert InvalidAddress();
        if (_gameContract == address(0)) revert InvalidAddress();
        if (_basenameResolver == address(0)) revert InvalidAddress();
        platformAddress = _platformAddress;
        gameContract = IDTAIOCGame(_gameContract);
        basenameResolver = IBasenameResolver(_basenameResolver);
        paused = false;
    }

    function deposit() external payable nonReentrant {
        if (msg.value == 0) revert InsufficientDeposit();
        entryPoint.depositTo{value: msg.value}(address(this));
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        if (amount > address(this).balance) revert InsufficientDeposit();
        (bool success, ) = platformAddress.call{value: amount}("");
        if (!success) revert WithdrawalFailed();
        emit Withdrawn(platformAddress, amount);
    }

    function setTokenContract(address _tokenContract) external onlyOwner {
        if (_tokenContract == address(0)) revert InvalidAddress();
        tokenContract = _tokenContract;
    }

    function setStakingContract(address _stakingContract) external onlyOwner {
        if (_stakingContract == address(0)) revert InvalidAddress();
        stakingContract = _stakingContract;
    }

    function setNFTContract(address _nftContract) external onlyOwner {
        if (_nftContract == address(0)) revert InvalidAddress();
        nftContract = _nftContract;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused();
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused();
    }

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash
        // uint256 maxCost // Unused, commented out
    ) external virtual override returns (bytes memory context, uint256 validationData) {
        if (msg.sender != address(entryPoint)) revert InvalidEntryPointCaller();
        if (paused) revert PaymasterPaused();

        if (!IMockSmartWallet(userOp.sender).verifySignature(userOpHash, userOp.signature)) {
            emit ValidationFailed(userOp.sender, "Invalid UserOperation signature");
            revert InvalidSignature();
        }

        address target;
        bytes4 functionSelector;
        bytes memory innerCallData;

        if (userOp.callData.length < 4) {
            emit ValidationFailed(userOp.sender, "Invalid callData length");
            revert InvalidCallData();
        }

        functionSelector = bytes4(userOp.callData[:4]);
        if (functionSelector == MockSmartWallet.execute.selector) {
            (target, innerCallData) = abi.decode(userOp.callData[4:], (address, bytes));
            if (innerCallData.length < 4) {
                emit ValidationFailed(userOp.sender, "innerCallData too short for selector");
                revert InvalidInnerCallData();
            }
            functionSelector = bytes4(
                bytes.concat(
                    innerCallData[0],
                    innerCallData[1],
                    innerCallData[2],
                    innerCallData[3]
                )
            );
        } else {
            target = userOp.sender;
            innerCallData = userOp.callData;
        }

        bool isValidContract = target == address(gameContract) ||
                              target == tokenContract ||
                              target == stakingContract ||
                              target == nftContract;
        if (!isValidContract) {
            emit ValidationFailed(userOp.sender, "Invalid target contract");
            revert InvalidTargetContract();
        }

        bool isUserAction = functionSelector == gameContract.createGame.selector ||
                            functionSelector == gameContract.joinGame.selector ||
                            functionSelector == gameContract.submitAnswers.selector ||
                            functionSelector == gameContract.mint.selector;
        if (isUserAction) {
            string memory resolvedBasename = basenameResolver.getBasename(userOp.sender);
            string memory resolvedTwitter = basenameResolver.getTwitterUsername(userOp.sender);
            bool hasBasename = bytes(resolvedBasename).length != 0;
            bool hasTwitter = bytes(resolvedTwitter).length != 0;
            if (!hasBasename && !hasTwitter) {
                emit ValidationFailed(userOp.sender, "No registered basename or Twitter username");
                revert NoRegisteredIdentifier();
            }

            if (functionSelector == gameContract.createGame.selector) {
                if (innerCallData.length < 4 + 32 + 32 + 96 + 32 + 32) {
                    emit ValidationFailed(userOp.sender, "Insufficient data for createGame");
                    revert InsufficientData("createGame");
                }
                bytes memory decodeData = new bytes(innerCallData.length - 4);
                for (uint256 i = 0; i < decodeData.length; i++) {
                    decodeData[i] = innerCallData[i + 4];
                }
                (string memory basename, string memory twitterUsername,,,) = 
                    abi.decode(decodeData, (string, string, bytes32[3], uint256, bytes));
                _validateIdentifier(userOp.sender, basename, twitterUsername, resolvedBasename, resolvedTwitter);
            } else if (functionSelector == gameContract.joinGame.selector) {
                if (innerCallData.length < 4 + 32 + 32 + 32 + 32) {
                    emit ValidationFailed(userOp.sender, "Insufficient data for joinGame");
                    revert InsufficientData("joinGame");
                }
                bytes memory decodeData = new bytes(innerCallData.length - 4);
                for (uint256 i = 0; i < decodeData.length; i++) {
                    decodeData[i] = innerCallData[i + 4];
                }
                (, string memory basename, string memory twitterUsername,) = 
                    abi.decode(decodeData, (uint256, string, string, bytes));
                _validateIdentifier(userOp.sender, basename, twitterUsername, resolvedBasename, resolvedTwitter);
            }
        }

        context = abi.encode(userOp.sender, userOpHash, functionSelector);
        validationData = _packValidationData(false, uint48(block.timestamp + 1 hours), 0);
        emit PaymasterValidated(userOp.sender, userOpHash, validationData);
        return (context, validationData);
    }

    function postOp(
        uint8 mode
        // bytes calldata context, // Unused, commented out
        // uint256 actualGasCost // Unused, commented out
    ) external virtual override {
        if (msg.sender != address(entryPoint)) revert InvalidEntryPointCaller();
        if (paused) revert PaymasterPaused();

        // (address sender, bytes32 userOpHash, bytes4 functionSelector) = 
        //     abi.decode(context, (address, bytes32, bytes4));
        // sponsoredUserOps[sender]++;
        // string memory action = _getActionName(functionSelector);
        // emit UserOpSponsored(sender, userOpHash, action);
        emit PaymasterPostOpCalled(address(0), bytes32(0), mode);
    }

    function _validateIdentifier(
        address sender,
        string memory providedBasename,
        string memory providedTwitter,
        string memory resolvedBasename,
        string memory resolvedTwitter
    ) internal {
        bool providedBasenameValid = bytes(providedBasename).length != 0;
        bool providedTwitterValid = bytes(providedTwitter).length != 0;
        bool hasBasename = bytes(resolvedBasename).length != 0;
        bool hasTwitter = bytes(resolvedTwitter).length != 0;

        if (providedBasenameValid == providedTwitterValid) {
            emit ValidationFailed(sender, "Provide exactly one identifier");
            revert InvalidIdentifier();
        }

        if (providedBasenameValid) {
            if (!hasBasename) {
                emit ValidationFailed(sender, "No basename registered for sender");
                revert BasenameMismatch();
            }
            if (keccak256(abi.encodePacked(providedBasename)) != keccak256(abi.encodePacked(resolvedBasename))) {
                emit ValidationFailed(sender, "Basename mismatch");
                revert BasenameMismatch();
            }
        } else {
            if (!hasTwitter) {
                emit ValidationFailed(sender, "No Twitter username registered for sender");
                revert TwitterMismatch();
            }
            if (keccak256(abi.encodePacked(providedTwitter)) != keccak256(abi.encodePacked(resolvedTwitter))) {
                emit ValidationFailed(sender, "Twitter username mismatch");
                revert TwitterMismatch();
            }
        }
    }

    function _packValidationData(
        bool sigFailed,
        uint48 validUntil,
        uint48 validAfter
    ) internal virtual override pure returns (uint256) {
        return (sigFailed ? 1 : 0) | (uint256(validUntil) << 160) | (uint256(validAfter) << (160 + 48));
    }

    function _getActionName(bytes4 selector) private view returns (string memory) {
        if (selector == gameContract.createGame.selector) return "createGame";
        if (selector == gameContract.joinGame.selector) return "joinGame";
        if (selector == gameContract.submitAnswers.selector) return "submitAnswers";
        if (selector == gameContract.mint.selector) return "mint";
        return "unknown";
    }

    receive() external payable override {
        emit Deposited(msg.sender, msg.value);
    }
}