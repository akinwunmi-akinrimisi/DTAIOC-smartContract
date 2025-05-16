const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DTAIOCPaymaster", function () {
  let DTAIOCPaymaster, paymaster, owner, addr1, addr2;
  let entryPoint, dtaiocToken, dtaiocGame, basenameResolver;
  let mockResolver, mockEntryPoint;
  const platformAddress = "0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB";

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy mock contracts
    const MockResolverFactory = await ethers.getContractFactory("MockBasenameResolver");
    mockResolver = await MockResolverFactory.deploy();
    await mockResolver.waitForDeployment();

    const MockEntryPointFactory = await ethers.getContractFactory("MockEntryPoint");
    mockEntryPoint = await MockEntryPointFactory.deploy();
    await mockEntryPoint.waitForDeployment();

    // Deploy DTAIOCToken
    const DTAIOCTokenFactory = await ethers.getContractFactory("DTAIOCToken");
    dtaiocToken = await DTAIOCTokenFactory.deploy();
    await dtaiocToken.waitForDeployment();

    // Deploy DTAIOCNFT
    const DTAIOCNFTFactory = await ethers.getContractFactory("DTAIOCNFT");
    const dtaiocNFT = await DTAIOCNFTFactory.deploy();
    await dtaiocNFT.waitForDeployment();

    // Deploy DTAIOCStaking with correct constructor arguments
    const DTAIOCStakingFactory = await ethers.getContractFactory("DTAIOCStaking");
    const dtaiocStaking = await DTAIOCStakingFactory.deploy(dtaiocToken.target, platformAddress);
    await dtaiocStaking.waitForDeployment();

    // Deploy DTAIOCGame
    const DTAIOCGameFactory = await ethers.getContractFactory("DTAIOCGame");
    const backendSigner = addr1.address; // Temporary for testing
    dtaiocGame = await DTAIOCGameFactory.deploy(
      dtaiocToken.target,
      dtaiocNFT.target,
      dtaiocStaking.target,
      mockResolver.target,
      backendSigner
    );
    await dtaiocGame.waitForDeployment();

    // Set mock addresses
    entryPoint = mockEntryPoint.target;
    basenameResolver = mockResolver.target;

    // Deploy Paymaster
    const DTAIOCPaymasterFactory = await ethers.getContractFactory("DTAIOCPaymaster");
    paymaster = await DTAIOCPaymasterFactory.deploy(
      entryPoint,
      dtaiocToken.target,
      dtaiocGame.target,
      basenameResolver
    );
    await paymaster.waitForDeployment();

    // Fund mock EntryPoint for Paymaster
    await mockEntryPoint.setBalance(paymaster.target, ethers.parseEther("0.1"));
  });

  describe("Initialization", function () {
    it("should initialize with correct addresses", async function () {
      expect(await paymaster.entryPoint()).to.equal(entryPoint);
      expect(await paymaster.dtaiocToken()).to.equal(dtaiocToken.target);
      expect(await paymaster.dtaiocGame()).to.equal(dtaiocGame.target);
      expect(await paymaster.basenameResolver()).to.equal(basenameResolver);
      expect(await paymaster.owner()).to.equal(owner.address);
    });

    it("should set default gas limits and paused state", async function () {
      expect(await paymaster.maxGasLimit()).to.equal(200_000);
      expect(await paymaster.maxGasPrice()).to.equal(100 * 10**9);
      expect(await paymaster.isPaused()).to.equal(false);
    });

    it("should revert if initialized with zero addresses", async function () {
      const DTAIOCPaymasterFactory = await ethers.getContractFactory("DTAIOCPaymaster");
      await expect(
        DTAIOCPaymasterFactory.deploy(
          ethers.ZeroAddress,
          dtaiocToken.target,
          dtaiocGame.target,
          basenameResolver
        )
      ).to.be.revertedWith("Invalid EntryPoint");
    });
  });

  describe("Core Logic", function () {
    it("should validate valid mint UserOp", async function () {
      await mockResolver.setBasename(addr1.address, "user.base.eth");

      // Encode callData to call dtaiocToken.mint(uint256)
      const tokenInterface = new ethers.Interface(["function mint(uint256 amount)"]);
      const callData = tokenInterface.encodeFunctionData("mint", [1]);

      const userOp = {
        sender: addr1.address,
        nonce: 0,
        callData: callData,
        callGasLimit: 100_000,
        verificationGasLimit: 50_000,
        preVerificationGas: 20_000,
        maxFeePerGas: 50 * 10**9,
        maxPriorityFeePerGas: 10 * 10**9,
        paymasterAndData: ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256"],
          [dtaiocToken.target, 0]
        )
      };

      const userOpHash = ethers.randomBytes(32);
      const maxCost = ethers.parseEther("0.01");

      try {
        const result = await mockEntryPoint.validatePaymasterUserOp.staticCall(
          paymaster.target,
          userOp,
          userOpHash,
          maxCost,
          { gasLimit: 500_000 }
        );
        console.log("validatePaymasterUserOp result:", result);
        const [context, validUntil, validAfter] = result;
        expect(context).to.not.equal("0x");
        expect(validUntil).to.be.gt(0);
        expect(validAfter).to.equal(0);
        expect(await paymaster.nonces(addr1.address)).to.equal(0); // Nonce not incremented in staticCall
        expect(await paymaster.lastSponsoredTime(addr1.address)).to.equal(0); // Not updated in staticCall
      } catch (error) {
        console.error("validatePaymasterUserOp failed:", error);
        throw error;
      }
    });

    it("should reject invalid Basename", async function () {
      // Encode callData to call dtaiocToken.mint(uint256)
      const tokenInterface = new ethers.Interface(["function mint(uint256 amount)"]);
      const callData = tokenInterface.encodeFunctionData("mint", [1]);

      const userOp = {
        sender: addr1.address,
        nonce: 0,
        callData: callData,
        callGasLimit: 100_000,
        verificationGasLimit: 50_000,
        preVerificationGas: 20_000,
        maxFeePerGas: 50 * 10**9,
        maxPriorityFeePerGas: 10 * 10**9,
        paymasterAndData: ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256"],
          [dtaiocToken.target, 0]
        )
      };

      const userOpHash = ethers.randomBytes(32);
      const maxCost = ethers.parseEther("0.01");

      await expect(
        mockEntryPoint.validatePaymasterUserOp.staticCall(paymaster.target, userOp, userOpHash, maxCost, {
          gasLimit: 500_000
        })
      ).to.be.revertedWith("Paymaster call failed: InvalidBasename");
    });
  });

  describe("Fund Management", function () {
    it("should accept direct ETH deposits", async function () {
      const depositAmount = ethers.parseEther("0.1");
      await owner.sendTransaction({ to: paymaster.target, value: depositAmount });
      expect(await ethers.provider.getBalance(paymaster.target)).to.equal(depositAmount);
      await expect(owner.sendTransaction({ to: paymaster.target, value: depositAmount }))
        .to.emit(paymaster, "DepositReceived")
        .withArgs(owner.address, depositAmount);
    });

    it("should allow owner to withdraw ETH", async function () {
      const depositAmount = ethers.parseEther("0.1");
      await owner.sendTransaction({ to: paymaster.target, value: depositAmount });

      const withdrawAmount = ethers.parseEther("0.05");
      await expect(paymaster.withdraw(owner.address, withdrawAmount))
        .to.emit(paymaster, "EthWithdrawn")
        .withArgs(owner.address, withdrawAmount);
      expect(await ethers.provider.getBalance(paymaster.target)).to.equal(depositAmount - withdrawAmount);
    });

    it("should enforce withdrawal limit", async function () {
      const depositAmount = ethers.parseEther("2");
      await owner.sendTransaction({ to: paymaster.target, value: depositAmount });

      const overLimit = ethers.parseEther("1.5");
      await expect(paymaster.withdraw(owner.address, overLimit)).to.be.revertedWith("WithdrawalLimitExceeded");

      const withinLimit = ethers.parseEther("0.5");
      await paymaster.withdraw(owner.address, withinLimit);
      expect(await ethers.provider.getBalance(paymaster.target)).to.equal(depositAmount - withinLimit);
    });
  });

  describe("Admin Functions", function () {
    it("should allow owner to pause and unpause", async function () {
      await expect(paymaster.pause()).to.emit(paymaster, "Paused");
      expect(await paymaster.isPaused()).to.equal(true);

      await expect(paymaster.unpause()).to.emit(paymaster, "Unpaused");
      expect(await paymaster.isPaused()).to.equal(false);
    });

    it("should prevent non-owner from pausing", async function () {
      await expect(paymaster.connect(addr1).pause())
        .to.be.revertedWithCustomError(paymaster, "OwnableUnauthorizedAccount")
        .withArgs(addr1.address);
    });

    it("should update Basename resolver", async function () {
      const newResolver = addr2.address;
      await expect(paymaster.setBasenameResolver(newResolver))
        .to.emit(paymaster, "ResolverUpdated")
        .withArgs(newResolver);
      expect(await paymaster.basenameResolver()).to.equal(newResolver);
    });

    it("should set gas limit and price", async function () {
      await expect(paymaster.setMaxGasLimit(300_000))
        .to.emit(paymaster, "ConfigChanged")
        .withArgs("maxGasLimit", 300_000);
      expect(await paymaster.maxGasLimit()).to.equal(300_000);

      await expect(paymaster.setMaxGasPrice(200 * 10**9))
        .to.emit(paymaster, "ConfigChanged")
        .withArgs("maxGasPrice", 200 * 10**9);
      expect(await paymaster.maxGasPrice()).to.equal(200 * 10**9);
    });

    it("should adjust gas limit based on average", async function () {
      await mockResolver.setBasename(addr1.address, "user.base.eth");

      // Encode callData to call dtaiocToken.mint(uint256)
      const tokenInterface = new ethers.Interface(["function mint(uint256 amount)"]);
      const callData = tokenInterface.encodeFunctionData("mint", [1]);

      const userOp = {
        sender: addr1.address,
        nonce: 0,
        callData: callData,
        callGasLimit: 100_000,
        verificationGasLimit: 50_000,
        preVerificationGas: 20_000,
        maxFeePerGas: 50 * 10**9,
        maxPriorityFeePerGas: 10 * 10**9,
        paymasterAndData: ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256"],
          [dtaiocToken.target, 0]
        )
      };

      const userOpHash = ethers.randomBytes(32);
      const maxCost = ethers.parseEther("0.01");

      try {
        // Simulate validatePaymasterUserOp via mockEntryPoint with staticCall
        const result = await mockEntryPoint.validatePaymasterUserOp.staticCall(
          paymaster.target,
          userOp,
          userOpHash,
          maxCost,
          { gasLimit: 500_000 }
        );
        console.log("validatePaymasterUserOp result:", result);
        const [context, validUntil, validAfter] = result;
        expect(context).to.not.equal("0x");
        expect(validUntil).to.be.gt(0);
        expect(validAfter).to.equal(0);

        // Update state by calling validatePaymasterUserOp as a transaction
        await mockEntryPoint.connect(owner).validatePaymasterUserOp(
          paymaster.target,
          userOp,
          userOpHash,
          maxCost,
          { gasLimit: 500_000 }
        );

        // Call postOp via mockEntryPoint
        await mockEntryPoint.connect(owner).callPostOp(
          paymaster.target,
          0, // mode
          context,
          100_000 * 10**9, // actualGasCost
          { gasLimit: 500_000 }
        );

        // Adjust gas limit
        await paymaster.adjustMaxGasLimit();
        expect(await paymaster.maxGasLimit()).to.equal(200_000); // 100,000 * 2
      } catch (error) {
        console.error("validatePaymasterUserOp or postOp failed:", error);
        throw error;
      }
    });

    it("should check Basename status", async function () {
      await mockResolver.setBasename(addr1.address, "user.base.eth");
      expect(await paymaster.getBasenameStatus(addr1.address)).to.equal(true);
      expect(await paymaster.getBasenameStatus(addr2.address)).to.equal(false);
    });
  });
});