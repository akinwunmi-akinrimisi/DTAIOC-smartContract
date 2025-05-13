// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// interface IPaymaster {
//     struct UserOperation {
//         address sender;
//         uint256 nonce;
//         bytes callData;
//         uint256 callGasLimit;
//         uint256 verificationGasLimit;
//         uint256 preVerificationGas;
//         uint256 maxFeePerGas;
//         uint256 maxPriorityFeePerGas;
//         bytes paymasterAndData;
//     }

//     function validatePaymasterUserOp(
//         UserOperation memory userOp,
//         bytes32 userOpHash,
//         uint256 maxCost
//     ) external returns (bytes memory context, uint48 validUntil, uint48 validAfter);
// }

// contract MockEntryPoint {
//     mapping(address => uint256) public balances;

//     // Define UserOperation struct
//     struct UserOperation {
//         address sender;
//         uint256 nonce;
//         bytes callData;
//         uint256 callGasLimit;
//         uint256 verificationGasLimit;
//         uint256 preVerificationGas;
//         uint256 maxFeePerGas;
//         uint256 maxPriorityFeePerGas;
//         bytes paymasterAndData;
//     }

//     function setBalance(address account, uint256 amount) external {
//         balances[account] = amount;
//     }

//     function validatePaymasterUserOp(
//         address paymaster,
//         UserOperation memory userOp,
//         bytes32 userOpHash,
//         uint256 maxCost
//     ) external returns (bytes memory context, uint48 validUntil, uint48 validAfter) {
//         IPaymaster paymasterContract = IPaymaster(paymaster);
//         try paymasterContract.validatePaymasterUserOp(userOp, userOpHash, maxCost) returns (
//             bytes memory _context,
//             uint48 _validUntil,
//             uint48 _validAfter
//         ) {
//             return (_context, _validUntil, _validAfter);
//         } catch Error(string memory reason) {
//             revert(string(abi.encodePacked("Paymaster call failed: ", reason)));
//         } catch {
//             revert("Paymaster call failed: Unknown error");
//         }
//     }

//     function callPostOp(
//         address paymaster,
//         uint8 mode,
//         bytes memory context,
//         uint256 actualGasCost
//     ) external {
//         (bool success, bytes memory result) = paymaster.call{gas: 200_000}(
//             abi.encodeWithSignature("postOp(uint8,bytes,uint256)", mode, context, actualGasCost)
//         );
//         if (!success) {
//             if (result.length >= 4) {
//                 string memory reason = abi.decode(result[4:], (string));
//                 revert(string(abi.encodePacked("PostOp call failed: ", reason)));
//             }
//             revert("PostOp call failed: Unknown error");
//         }
//     }
// }