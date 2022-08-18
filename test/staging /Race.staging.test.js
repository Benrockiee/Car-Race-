const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
  ? describe.skip
  : describe("Race Staging Tests", function () {
      let race, raceEntryFee, deployer
      // const chainId = network.config.chainId

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        race = await ethers.getContract("Race", deployer)
        raceEntryFee = await race.getEntryFee()
      })
      describe("fulfillRandomWords", function () {
        it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function () {
          console.log("Setting up test...")
          const startingTimeStamp = await race.getLatestTimeStamp()
          const accounts = await ethers.getSigners()

          console.log("Setting up Listener...")
          await new Promise(async (resolve, reject) => {
            race.once("WinnerPicked", async () => {
              console.log("WinnerPicked event fired!")
              try {
                const recentWinner = await race.getRecentWinner()
                race = await race.getRaceState()
                const winnerEndingBalance = await accounts[0].getBalance()
                const endingTimeStamp = await race.getLastTimeStamp()

                await expect(race.getRacer(0)).to.be.reverted
                assert.equal(recentWinner.toString(), accounts[0].address)
                assert.equal(raceState, 0)
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(raceEntryFee).toString()
                )
                assert(endingTimeStamp > startingTimeStamp)
                resolve()
              } catch (error) {
                console.log(error)
                reject(error)
              }
            })
            // Then entering the raffle
            console.log("Entering CarRace...")
            const tx = await race.enterRace({ value: raceEntryFee })
            await tx.wait(1)
            console.log("Ok, time to wait...")
            const winnerStartingBalance = await accounts[0].getBalance()
          })
        })
      })
    })
