# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.js

Deploying contracts with: 0x671b2d2b41AF93A1DBeb9E72e68E3Ce1C018B845
DTAIOCToken deployed to: 0x46DAcEc0BeeE57c56b03F8362144075A097E4f01
DTAIOCNFT deployed to: 0xe330f2FDFb5568af4F9BD75e3b18C2723Fc47F05
DTAIOCStaking deployed to: 0x5c417667C5187Db3DdB4f3569e49Be0a4E7844cC
DTAIOCStaking owner: 0x671b2d2b41AF93A1DBeb9E72e68E3Ce1C018B845
MockBasenameResolver deployed to: 0xa0206d7BDDbB73fD8FAE277C95AdC9A566AcE3AE
DTAIOCGame deployed to: 0xd12385D761dEe072D23027D8ebA0b6FC071C3Acd
Setting game contract for NFT...
NFT game contract set to: 0xd12385D761dEe072D23027D8ebA0b6FC071C3Acd
Setting game contract for Staking...
Staking game contract set to: 0xd12385D761dEe072D23027D8ebA0b6FC071C3Acd
Verified gameContract in Staking: 0xd12385D761dEe072D23027D8ebA0b6FC071C3Acd
Update forkGameSimulation.js with:
tokenAddress: "0x46DAcEc0BeeE57c56b03F8362144075A097E4f01"
nftAddress: "0xe330f2FDFb5568af4F9BD75e3b18C2723Fc47F05"
stakingAddress: "0x5c417667C5187Db3DdB4f3569e49Be0a4E7844cC"
resolverAddress: "0xa0206d7BDDbB73fD8FAE277C95AdC9A566AcE3AE"
platformAddress: "0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB"