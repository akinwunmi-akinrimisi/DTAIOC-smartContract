const hre = require("hardhat");

   async function main() {
     const [deployer] = await hre.ethers.getSigners();
     console.log("Deploying contracts with account:", deployer.address);

     // Deploy DTAIOCToken
     const DTAIOCToken = await hre.ethers.getContractFactory("DTAIOCToken");
     const token = await DTAIOCToken.deploy();
     await token.waitForDeployment();
     console.log("DTAIOCToken deployed to:", token.target);

     // Deploy DTAIOCNFT
     const DTAIOCNFT = await hre.ethers.getContractFactory("DTAIOCNFT");
     const nft = await DTAIOCNFT.deploy();
     await nft.waitForDeployment();
     console.log("DTAIOCNFT deployed to:", nft.target);

     // Deploy DTAIOCStaking
     const platformAddress = "0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB"; 
     const DTAIOCStaking = await hre.ethers.getContractFactory("DTAIOCStaking");
     const staking = await DTAIOCStaking.deploy(token.target, platformAddress);
     await staking.waitForDeployment();
     console.log("DTAIOCStaking deployed to:", staking.target);

     // Deploy MockBasenameResolver
     const MockBasenameResolver = await hre.ethers.getContractFactory("MockBasenameResolver");
     const resolver = await MockBasenameResolver.deploy();
     await resolver.waitForDeployment();
     console.log("MockBasenameResolver deployed to:", resolver.target);

     // Deploy DTAIOCGame
     const DTAIOCGame = await hre.ethers.getContractFactory("DTAIOCGame");
     const game = await DTAIOCGame.deploy(token.target, nft.target, staking.target, resolver.target);
     await game.waitForDeployment();
     console.log("DTAIOCGame deployed to:", game.target);

     // Configure contract permissions
     await nft.setGameContract(game.target);
     await staking.setGameContract(game.target);
     console.log("Permissions configured for DTAIOCNFT and DTAIOCStaking");
   }

   main().catch((error) => {
     console.error(error);
     process.exitCode = 1;
   });