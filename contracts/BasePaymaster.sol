// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IEntryPoint.sol";

contract BasePaymaster {
    IEntryPoint public immutable entryPoint;

    error InvalidEntryPointCaller();

    event PaymasterValidated(address indexed sender, bytes32 indexed userOpHash, uint256 validationData);
    event PaymasterPostOpCalled(address indexed sender, bytes32 indexed userOpHash, uint8 mode);

    constructor(IEntryPoint _entryPoint) {
        if (address(_entryPoint) == address(0)) revert InvalidEntryPointCaller();
        entryPoint = _entryPoint;
    }

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash
        // uint256 maxCost // Unused, commented out
    ) external virtual returns (bytes memory context, uint256 validationData) {
        if (msg.sender != address(entryPoint)) revert InvalidEntryPointCaller();
        context = abi.encode(userOp.sender, userOpHash);
        validationData = _packValidationData(false, uint48(block.timestamp + 1 hours), 0);
        emit PaymasterValidated(userOp.sender, userOpHash, validationData);
        return (context, validationData);
    }

    function postOp(
        uint8 mode
        // bytes calldata context, // Unused, commented out
        // uint256 actualGasCost // Unused, commented out
    ) external virtual {
        if (msg.sender != address(entryPoint)) revert InvalidEntryPointCaller();
        emit PaymasterPostOpCalled(address(0), bytes32(0), mode);
    }

    function _packValidationData(
        bool sigFailed,
        uint48 validUntil,
        uint48 validAfter
    ) internal virtual pure returns (uint256) {
        return (sigFailed ? 1 : 0) | (uint256(validUntil) << 160) | (uint256(validAfter) << (160 + 48));
    }

    receive() external payable virtual {}
}