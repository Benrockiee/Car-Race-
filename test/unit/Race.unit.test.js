const { assert, expect } = require("chai")
const { ethers, deployments, network } = require("hardhat")
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Race unit test", function () {
      let race,
        raceContract,
        vrfCoordinatorV2Mock,
        raceEntryFee,
        interval,
        player

      beforeEach(async () => {
        accounts = await ethers.getSigners()
        player = accounts[1]
        await deployments.fixture(["mocks", "race"])
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        raceContract = await ethers.getContract("Race")
        race = raceContract.connect(player)
        raceEntryFee = await race.getEntryFee()
        interval = await race.getInterval()
      })

      describe("constructor", function () {
        console.log("race")
        it("initializes the race correctly", async () => {
          race = (await race.getRaceState()).toString()
          assert.equal(race, "0")
          assert.equal(
            interval.toString(),
            networkConfig[network.config.chainId]["interval"]
          )
        })
      })

      describe("enterRace", function () {
        it("reverts when you don't pay enough", async () => {
          await expect(race.enterRace()).to.be.revertedWith(
            "Race__EntryFeeNotEnough()"
          )
        })

        it("records player when they enter", async () => {
          await race.enterRace({ value: raceEntryFee })
          const contractPlayer = await race.getRacer(0)
          assert.equal(player.address, contractPlayer)
        })

        it("emits event on enter", async () => {
          await expect(race.enterRace({ value: raceEntryFee })).to.emit(
            race,
            "RaceEnter"
          )
        })

        it("doesn't allow entrance when race is calculating", async () => {
          await race.enterRace({ value: raceEntryFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          await race.performUpkeep([])
          await expect(
            race.enterRace({ value: raceEntryFee })
          ).to.be.revertedWith("Race__RaceNotOpen")
        })
      })

      describe("checkUpkeep", function () {
        it("returns false if people haven't sent any eth", async () => {
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const { upkeepNeeded } = await race.callStatic.checkUpkeep("0x")
          assert(!upkeepNeeded)
        })
        it("returns false if race isn't open", async () => {
          await race.enterRace({ value: raceEntryFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          await race.performUpkeep([])
          const raceState = await race.getRaceState()
          const { upkeepNeeded } = await race.callStatic.checkUpkeep("0x")
          assert.equal(raceState.toString() == "1", upkeepNeeded == false)
        })

        it("returns false if enough time hasn't passed", async () => {
          await race.enterRace({ value: raceEntryFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const { upkeepNeeded } = await race.callStatic.checkUpkeep("0x")
          assert == !upkeepNeeded
        })

        it("returns false if there's not enough engine oil", async () => {
          await race.enterRace({ value: raceEntryFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const carState = await race.getCarState()
          const { upkeepNeeded } = await race.callStatic.checkUpkeep("0x")
          assert == !upkeepNeeded
        })

        it("returns false if car tyres isn't reinforced", async () => {
          await race.enterRace({ value: raceEntryFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const carState = await race.getCarState()
          const { upkeepNeeded } = await race.callStatic.checkUpkeep("0x")
          assert == !upkeepNeeded
        })

        it("returns true if enough time has passed, has racers, eth, open, enough engine oil and reenforced car tyres", async () => {
          await race.enterRace({ value: raceEntryFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const { upkeepNeeded } = await race.callStatic.checkUpkeep("0x")
          assert(upkeepNeeded)
        })
      })
      describe("performUpkeep", function () {
        it("can only run if checkUpkeep is true", async () => {
          await race.enterRace({ value: raceEntryFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const tx = await race.performUpkeep("0x")
          assert(tx)
        })

        it("reverts if checkUpkeep is false", async () => {
          await expect(race.performUpkeep("0x")).to.be.revertedWith(
            "Race__UpkeepNotNeeded"
          )
        })

        it("updates the race state and emits a requested id", async () => {
          await race.enterRace({ value: raceEntryFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const txResponse = await race.performUpkeep("0x")
          const txReceipt = await txResponse.wait(1)
          const raceState = await race.getRaceState()
          const requestId = txReceipt.events[1].args.requestId
          assert(requestId.toNumber() > 0)
          assert(raceState == 1)
        })
      })

      describe("fulfillRandomWords", function () {
        beforeEach(async () => {
          await race.enterRace({ value: raceEntryFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
        })

        it("can only be called after perform Upkeep", async () => {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, race.address)
          ).to.be.revertedWith("nonexistent request")
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, race.address)
          ).to.be.revertedWith("nonexistent request")
        })

        it.only("picks a winner, resets, and sends money", async () => {
          const additionalEntrances = 3 // to test
          const startingIndex = 2
          for (
            let i = startingIndex;
            i < startingIndex + additionalEntrances;
            i++
          ) {
            // i = 2; i < 5; i=i+1
            race = raceContract.connect(accounts[i])
            await race.enterRace({ value: raceEntryFee })
          }
          const startingTimeStamp = await race.getLatestTimeStamp()

          await new Promise(async (resolve, reject) => {
            race.once("WinnerPicked", async () => {
              console.log("Winner Picked event fired!")
              try {
                const recentWinner = await race.getRecentWinner()
                const raceState = await race.getRaceState()
                const carState = await race.getCarState()
                const winnerBalance = await accounts[2].getBalance()
                const endingTimeStamp = await race.getLastTimeStamp()
                await expect(race.getRacer(0)).to.be.reverted
                assert.equal(recentWinner.toString(), accounts[2].address)
                assert.equal(raceState, 0)
                assert.equal(carState, 0)
                assert.equal(carState, 1)
                assert.equal(
                  winnerBalance.toString(),
                  startingBalance.add(
                    raceEntryFee
                      .mul(additionalEntrances)
                      .add(raceEntryFee)
                      .toString()
                  )
                )
                assert(endingTimeStamp > startingTimeStamp)
                resolve()
              } catch (e) {
                reject(e)
              }
            })

            const tx = await race.performUpkeep("0x")
            const txReceipt = await tx.wait(1)
            const startingBalance = await accounts[2].getBalance()
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events[1].args.requestId,
              race.address
            )
          })
        })
      })
    })
