const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DTAIOCPaymaster", function () {
  let paymaster, entryPoint, basenameResolver, platform, user, gameContract, tokenContract, nftContract, stakingContract, wallet, backendSigner;

  beforeEach(async function () {
    [platform, user, backendSigner] = await ethers.getSigners();
    console.log("Platform address:", platform.address);
    console.log("User address:", user.address);
    console.log("Backend signer address:", backendSigner.address);

    // Deploy MockBasenameResolver
    const BasenameResolver = await ethers.getContractFactory("MockBasenameResolver");
    basenameResolver = await BasenameResolver.deploy();
    await basenameResolver.waitForDeployment();
    console.log("MockBasenameResolver deployed to:", basenameResolver.target);

    // Deploy MockEntryPoint
    const EntryPoint = await ethers.getContractFactory("MockEntryPoint");
    entryPoint = await EntryPoint.deploy();
    await entryPoint.waitForDeployment();
    console.log("MockEntryPoint deployed to:", entryPoint.target);

    // Deploy DTAIOCToken
    const Token = await ethers.getContractFactory("DTAIOCToken");
    tokenContract = await Token.deploy();
    await tokenContract.waitForDeployment();
    console.log("DTAIOCToken deployed to:", tokenContract.target);

    // Deploy DTAIOCNFT
    const NFT = await ethers.getContractFactory("DTAIOCNFT");
    nftContract = await NFT.deploy();
    await nftContract.waitForDeployment();
    console.log("DTAIOCNFT deployed to:", nftContract.target);

    // Deploy DTAIOCStaking
    const Staking = await ethers.getContractFactory("DTAIOCStaking");
    stakingContract = await Staking.deploy(tokenContract.target, platform.address);
    await stakingContract.waitForDeployment();
    console.log("DTAIOCStaking deployed to:", stakingContract.target);

    // Deploy DTAIOCGame
    const Game = await ethers.getContractFactory("DTAIOCGame");
    gameContract = await Game.deploy(
      tokenContract.target,
      nftContract.target,
      stakingContract.target,
      basenameResolver.target,
      backendSigner.address,
      platform.address
    );
    await gameContract.waitForDeployment();
    console.log("DTAIOCGame deployed to:", gameContract.target);

    // Deploy MockSmartWallet
    const Wallet = await ethers.getContractFactory("MockSmartWallet");
    wallet = await Wallet.deploy(user.address);
    await wallet.waitForDeployment();
    console.log("MockSmartWallet deployed to:", wallet.target);

    // Set Basename for wallet
    await basenameResolver.setBasename(wallet.target, "user.base.eth");
    console.log("Basename for wallet:", await basenameResolver["resolve(address)"](wallet.target));

    // Deploy DTAIOCPaymaster
    const Paymaster = await ethers.getContractFactory("DTAIOCPaymaster");
    paymaster = await Paymaster.deploy(
      entryPoint.target,
      platform.address,
      gameContract.target,
      basenameResolver.target
    );
    await paymaster.waitForDeployment();
    console.log("DTAIOCPaymaster deployed to:", paymaster.target);

    // Set contract addresses
    await paymaster.setTokenContract(tokenContract.target);
    await paymaster.setStakingContract(stakingContract.target);
    await paymaster.setNFTContract(nftContract.target);

    // Fund Paymaster
    await platform.sendTransaction({ to: paymaster.target, value: ethers.parseEther("1") });
    await paymaster.deposit({ value: ethers.parseEther("1") });
    console.log("Paymaster funded with 1 ETH");

    // Set up game
    await nftContract.setGameContract(gameContract.target);
    await stakingContract.setGameContract(gameContract.target);
    const questionHashes = [
      ethers.keccak256(ethers.toUtf8Bytes("question1")),
      ethers.keccak256(ethers.toUtf8Bytes("question2")),
      ethers.keccak256(ethers.toUtf8Bytes("question3")),
    ];
    const tx = await gameContract.connect(platform).createGame("user.base.eth", "", questionHashes, 3600, "0x");
    const receipt = await tx.wait();
    console.log("Game created with ID:", receipt.logs
      .map((log) => gameContract.interface.parseLog(log))
      .find((e) => e?.name === "GameCreated")?.args.gameId);
  });

  it("should validate UserOp for joinGame with valid Basename", async function () {
    // Mint and approve tokens for wallet
    await tokenContract.connect(user).mint(ethers.parseEther("10"));
    await tokenContract.connect(user).approve(stakingContract.target, ethers.parseEther("10"));

    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "string", "uint256"],
        [wallet.target, "user.base.eth", 1]
      )
    );
    const signature = await backendSigner.signMessage(ethers.getBytes(messageHash));
    const joinGameData = gameContract.interface.encodeFunctionData("joinGame", [1, "user.base.eth", "", signature]);
    const userOp = {
      sender: wallet.target,
      nonce: 0,
      initCode: "0x",
      callData: wallet.interface.encodeFunctionData("execute", [gameContract.target, joinGameData]),
      callGasLimit: 200000,
      verificationGasLimit: 100000,
      preVerificationGas: 21000,
      maxFeePerGas: 1000000000,
      maxPriorityFeePerGas: 1000000000,
      paymasterAndData: ethers.concat([paymaster.target, "0x"]),
      signature: "0x"
    };

    console.log("userOp.callData:", userOp.callData);
    const userOpHash = ethers.keccak256("0x1234"); // Mock hash
    console.log("Calling validatePaymasterUserOp for wallet:", wallet.target);
    const [context, validationData] = await entryPoint.validatePaymasterUserOp(
      paymaster.target,
      userOp,
      userOpHash,
      0
    );

    // Decode validationData
    const sigFailed = (validationData & 1) === 1;
    const validUntil = Number((validationData >> 160) & ((1n << 48n) - 1n));
    const validAfter = Number((validationData >> (160 + 48)) & ((1n << 48n) - 1n));

    expect(context).to.equal(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [wallet.target]));
    expect(sigFailed).to.equal(false);
    expect(validUntil).to.be.gt(Math.floor(Date.now() / 1000));
    expect(validAfter).to.equal(0);
    expect(await paymaster.sponsoredUserOps(wallet.target)).to.equal(0);

    // Simulate postOp
    console.log("Calling postOp for wallet:", wallet.target);
    await entryPoint.postOp(paymaster.target, 0, context, 100000);
    expect(await paymaster.sponsoredUserOps(wallet.target)).to.equal(1);
  });

  it("should reject UserOp with invalid Basename", async function () {
    const joinGameData = gameContract.interface.encodeFunctionData("joinGame", [1, "invalid.base.eth", "", "0x"]);
    const userOp = {
      sender: wallet.target,
      nonce: 0,
      initCode: "0x",
      callData: wallet.interface.encodeFunctionData("execute", [gameContract.target, joinGameData]),
      callGasLimit: 200000,
      verificationGasLimit: 100000,
      preVerificationGas: 21000,
      maxFeePerGas: 1000000000,
      maxPriorityFeePerGas: 1000000000,
      paymasterAndData: ethers.concat([paymaster.target, "0x"]),
      signature: "0x"
    };

    console.log("userOp.callData:", userOp.callData);
    const userOpHash = ethers.keccak256("0x1234");
    await expect(
      entryPoint.validatePaymasterUserOp(paymaster.target, userOp, userOpHash, 0)
    ).to.be.revertedWith("Basename mismatch");
  });

  it("should reject UserOp when paused", async function () {
    await paymaster.pause();
    const joinGameData = gameContract.interface.encodeFunctionData("joinGame", [1, "user.base.eth", "", "0x"]);
    const userOp = {
      sender: wallet.target,
      nonce: 0,
      initCode: "0x",
      callData: wallet.interface.encodeFunctionData("execute", [gameContract.target, joinGameData]),
      callGasLimit: 200000,
      verificationGasLimit: 100000,
      preVerificationGas: 21000,
      maxFeePerGas: 1000000000,
      maxPriorityFeePerGas: 1000000000,
      paymasterAndData: ethers.concat([paymaster.target, "0x"]),
      signature: "0x"
    };

    console.log("userOp.callData:", userOp.callData);
    const userOpHash = ethers.keccak256("0x1234");
    await expect(
      entryPoint.validatePaymasterUserOp(paymaster.target, userOp, userOpHash, 0)
    ).to.be.revertedWith("Paymaster paused");
  });

  it("should allow deposit and withdraw", async function () {
    const initialBalance = await ethers.provider.getBalance(paymaster.target);
    await platform.sendTransaction({ to: paymaster.target, value: ethers.parseEther("0.5") });
    expect(await ethers.provider.getBalance(paymaster.target)).to.equal(initialBalance + ethers.parseEther("0.5"));

    await paymaster.withdraw(ethers.parseEther("0.3"));
    expect(await ethers.provider.getBalance(paymaster.target)).to.equal(initialBalance + ethers.parseEther("0.2"));
  });

  it("should join with Twitter username", async function () {
    const twitterUsername = "@user";
    await basenameResolver.setTwitterUsername(user.address, twitterUsername);
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "string", "uint256"],
        [user.address, twitterUsername, 1]
      )
    );
    const signature = await backendSigner.signMessage(ethers.getBytes(messageHash));
    await gameContract.connect(user).joinGame(1, "", twitterUsername, signature);
    const [, twitter,,,] = await gameContract.getPlayer(1, user.address);
    expect(twitter).to.equal(twitterUsername);
  });
});