# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.js

///////
➜  DTAIOC-smartContract git:(main) ✗ npx hardhat run scripts/deploy.js --network baseSepolia 
Deploying contracts with: 0x671b2d2b41AF93A1DBeb9E72e68E3Ce1C018B845
DTAIOCToken deployed to: 0x9D202FdF661eE662335f0A44EAB4447316F48065
Verifying DTAIOCToken at 0x9D202FdF661eE662335f0A44EAB4447316F48065...
The contract 0x9D202FdF661eE662335f0A44EAB4447316F48065 has already been verified on the block explorer. If you're trying to verify a partially verified contract, please use the --force flag.
https://sepolia.basescan.org/address/0x9D202FdF661eE662335f0A44EAB4447316F48065#code

DTAIOCToken verified successfully!
DTAIOCNFT deployed to: 0x3ae2a3C76Da74f2A58F1160c49CF872354fbf8db
Verifying DTAIOCNFT at 0x3ae2a3C76Da74f2A58F1160c49CF872354fbf8db...
The contract 0x3ae2a3C76Da74f2A58F1160c49CF872354fbf8db has already been verified on the block explorer. If you're trying to verify a partially verified contract, please use the --force flag.
https://sepolia.basescan.org/address/0x3ae2a3C76Da74f2A58F1160c49CF872354fbf8db#code

DTAIOCNFT verified successfully!
DTAIOCStaking deployed to: 0xa23f3A0dB05d9E6570CBB6749eEd41B916009AC3
Verifying DTAIOCStaking at 0xa23f3A0dB05d9E6570CBB6749eEd41B916009AC3...
Successfully submitted source code for contract
contracts/DTAIOCStaking.sol:DTAIOCStaking at 0xa23f3A0dB05d9E6570CBB6749eEd41B916009AC3
for verification on the block explorer. Waiting for verification result...

DTAIOCStaking is already verified.
DTAIOCStaking owner: 0x671b2d2b41AF93A1DBeb9E72e68E3Ce1C018B845
MockBasenameResolver deployed to: 0x7d1277625CbdD5A629Cb4A71A1c378e2Dd46D31A
Verifying MockBasenameResolver at 0x7d1277625CbdD5A629Cb4A71A1c378e2Dd46D31A...
The contract 0x7d1277625CbdD5A629Cb4A71A1c378e2Dd46D31A has already been verified on the block explorer. If you're trying to verify a partially verified contract, please use the --force flag.
https://sepolia.basescan.org/address/0x7d1277625CbdD5A629Cb4A71A1c378e2Dd46D31A#code

MockBasenameResolver verified successfully!
DTAIOCGame deployed to: 0x032423aB9c43409A1CD6391B4054BB7ADC5ee52c
Verifying DTAIOCGame at 0x032423aB9c43409A1CD6391B4054BB7ADC5ee52c...
The contract 0x032423aB9c43409A1CD6391B4054BB7ADC5ee52c has already been verified on the block explorer. If you're trying to verify a partially verified contract, please use the --force flag.
https://sepolia.basescan.org/address/0x032423aB9c43409A1CD6391B4054BB7ADC5ee52c#code

DTAIOCGame verified successfully!
DTAIOCPaymaster deployed to: 0x5A7BdA3776c72aF8A07e4F259115377B34af6901
Verifying DTAIOCPaymaster at 0x5A7BdA3776c72aF8A07e4F259115377B34af6901...
Successfully submitted source code for contract
contracts/DTAIOCPaymaster.sol:DTAIOCPaymaster at 0x5A7BdA3776c72aF8A07e4F259115377B34af6901
for verification on the block explorer. Waiting for verification result...

Successfully verified contract DTAIOCPaymaster on the block explorer.
https://sepolia.basescan.org/address/0x5A7BdA3776c72aF8A07e4F259115377B34af6901#code

DTAIOCPaymaster verified successfully!
DTAIOCPaymaster owner: 0x671b2d2b41AF93A1DBeb9E72e68E3Ce1C018B845
Setting token, staking, and NFT contracts in Paymaster...
Token contract set to: 0x9D202FdF661eE662335f0A44EAB4447316F48065
Staking contract set to: 0xa23f3A0dB05d9E6570CBB6749eEd41B916009AC3
NFT contract set to: 0x3ae2a3C76Da74f2A58F1160c49CF872354fbf8db
Configuring DTAIOCNFT and DTAIOCStaking...
DTAIOCNFT game contract set to: 0x032423aB9c43409A1CD6391B4054BB7ADC5ee52c
DTAIOCStaking game contract set to: 0x032423aB9c43409A1CD6391B4054BB7ADC5ee52c
Funding Paymaster with 0.01 ETH...
ETH sent to Paymaster
Depositing to EntryPoint...
Paymaster deposited to EntryPoint
Update forkGameSimulation.js with:
tokenAddress: "0x9D202FdF661eE662335f0A44EAB4447316F48065"
nftAddress: "0x3ae2a3C76Da74f2A58F1160c49CF872354fbf8db"
stakingAddress: "0xa23f3A0dB05d9E6570CBB6749eEd41B916009AC3"
resolverAddress: "0x7d1277625CbdD5A629Cb4A71A1c378e2Dd46D31A"
gameAddress: "0x032423aB9c43409A1CD6391B4054BB7ADC5ee52c"
entryPointAddress: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
paymasterAddress: "0x5A7BdA3776c72aF8A07e4F259115377B34af6901"
platformAddress: "0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB"