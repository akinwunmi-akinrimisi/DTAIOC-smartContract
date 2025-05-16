// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

struct UserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes paymasterAndData;
    bytes signature;
}

interface IPaymaster {
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData);

    function postOp(
        uint8 mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external;
}

contract MockEntryPoint is Ownable {
    error UnauthorizedCaller();
    error InvalidUserOperation();

    mapping(address => uint256) public deposits;
    mapping(address => bool) public authorizedPaymasters;

    event Deposited(address indexed account, uint256 amount);
    event UserOperationHandled(address indexed sender, bytes32 indexed userOpHash);
    event PaymasterAuthorized(address indexed paymaster);
    event PaymasterRevoked(address indexed paymaster);

    constructor() Ownable(msg.sender) {}

    function depositTo(address account) external payable {
        if (!authorizedPaymasters[msg.sender]) revert UnauthorizedCaller();
        deposits[account] += msg.value;
        emit Deposited(account, msg.value);
    }

    function validatePaymasterUserOp(
        address paymaster,
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData) {
        if (!authorizedPaymasters[paymaster]) revert UnauthorizedCaller();
        return IPaymaster(paymaster).validatePaymasterUserOp(userOp, userOpHash, maxCost);
    }

    function postOp(
        address paymaster,
        uint8 mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external {
        if (!authorizedPaymasters[paymaster]) revert UnauthorizedCaller();
        IPaymaster(paymaster).postOp(mode, context, actualGasCost);
    }

    function handleOps(
        UserOperation[] calldata ops,
        address payable beneficiary
    ) external {
        if (!authorizedPaymasters[msg.sender]) revert UnauthorizedCaller();
        for (uint256 i = 0; i < ops.length; i++) {
            UserOperation calldata userOp = ops[i];
            bytes32 userOpHash = keccak256(abi.encode(userOp));
            if (userOp.paymasterAndData.length == 0) revert InvalidUserOperation();

            address paymaster = address(bytes20(userOp.paymasterAndData[0:20]));
            if (!authorizedPaymasters[paymaster]) revert UnauthorizedCaller();

            (bytes memory context, /* uint256 validationData */) = IPaymaster(paymaster).validatePaymasterUserOp(
                userOp,
                userOpHash,
                userOp.maxFeePerGas * (userOp.callGasLimit + userOp.verificationGasLimit)
            );

            IPaymaster(paymaster).postOp(0, context, userOp.maxFeePerGas * userOp.callGasLimit);
            emit UserOperationHandled(userOp.sender, userOpHash);
        }
        if (beneficiary != address(0) && address(this).balance > 0) {
            (bool success, ) = beneficiary.call{value: address(this).balance}("");
            require(success, "Transfer failed");
        }
    }

    function authorizePaymaster(address paymaster) external onlyOwner {
        if (paymaster == address(0)) revert UnauthorizedCaller();
        authorizedPaymasters[paymaster] = true;
        emit PaymasterAuthorized(paymaster);
    }

    function revokePaymaster(address paymaster) external onlyOwner {
        authorizedPaymasters[paymaster] = false;
        emit PaymasterRevoked(paymaster);
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }
}