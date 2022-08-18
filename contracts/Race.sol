//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Race__EntryFeeNotEnough();
error Race__RaceNotOpen();
error Race__TransferFailed();
error Race__EngineOilNotEnough();
error Race__UpkeepNotNeeded(
  uint256 currentBalance,
  uint256 numPlayers,
  uint256 raceState,
  uint256 carState
);

/**@title A sample Race Contract
 * @author Benjamin izuchukwu umeike
 * @notice This contract is for creating a sample race contract
 * @dev This implements the Chainlink VRF Version 2
 */

contract Race is VRFConsumerBaseV2, KeeperCompatibleInterface {
  /*Type declarations*/
  enum RaceState {
    OPEN, //0
    CALCULATING //1
  }
  enum CarState {
    FAULTY_ENGINE,
    BLOWN_TYRE
  }

  /* State variables */
  // Chainlink VRF Variables
  VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
  uint64 private immutable i_subscriptionId;
  bytes32 private immutable i_gasLane;
  uint32 private immutable i_callbackGasLimit;
  uint16 private constant REQUEST_CONFIRMATIONS = 3;
  uint32 private constant NUM_WORDS = 1;

  //Racing varaible
  uint256 private immutable i_interval;
  uint256 public immutable i_entryFee;
  uint256 private s_lastTimeStamp;
  address private s_recentWinner;
  address private s_recentBlownTyre;
  CarState private s_carState;
  address payable[] private s_racers;
  RaceState private s_raceState;

  /* Events */
  event RaceEnter(address indexed racer);
  event RequestedRaceWinner(uint256 indexed requestId);
  event RecentBlownTyre(uint256 indexed requestId);
  event RecentFaultyEngine(uint256 indexed _requestId);
  event winnerPicked(address indexed winner);

  /* Functions */
  constructor(
    address vrfCoordinatorV2,
    uint64 subscriptionId,
    bytes32 gasLane,
    uint256 interval,
    uint256 entryFee,
    uint32 callbackGasLimit
  ) VRFConsumerBaseV2(vrfCoordinatorV2) {
    i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
    i_gasLane = gasLane;
    i_interval = interval;
    i_subscriptionId = subscriptionId;
    i_entryFee = entryFee;
    s_raceState = RaceState.OPEN;
    s_lastTimeStamp = block.timestamp;
    i_callbackGasLimit = callbackGasLimit;
  }

  function enterRace() public payable {
    // require(msg.value >= i_entranceFee, "Not enough value sent");
    // require(s_raffleState == RaceState.OPEN, "Race is not open");

    if (msg.value < i_entryFee) {
      revert Race__EntryFeeNotEnough();
    }
    if (s_raceState != RaceState.OPEN) {
      revert Race__RaceNotOpen();
    }
    s_racers.push(payable(msg.sender));
    //Emit an event when we update a dynamic array or mapping
    // Named events with the function name reversed
    emit RaceEnter(msg.sender);
  }

  function checkUpkeep(
    bytes memory /*callData*/
  )
    public
    view
    override
    returns (
      bool upkeepNeeded,
      bytes memory /*performData*/
    )
  {
    bool isOpen = RaceState.OPEN == s_raceState;
    bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
    bool hasRacers = (s_racers.length > 0);
    bool hasBalance = address(this).balance > 0;
    bool EnoughEngineOilAndReinforcedTyres = CarState.FAULTY_ENGINE ==
      s_carState;

    upkeepNeeded = (isOpen &&
      timePassed &&
      hasRacers &&
      hasBalance &&
      EnoughEngineOilAndReinforcedTyres);
  }

  function performUpkeep(
    bytes calldata /*performData*/
  ) external override {
    (bool upkeepNeeded, ) = checkUpkeep("");
    if (!upkeepNeeded) {
      revert Race__UpkeepNotNeeded(
        address(this).balance,
        s_racers.length,
        uint256(s_raceState),
        uint256(s_carState)
      );
    }
    s_raceState = RaceState.CALCULATING;
    s_carState = CarState.BLOWN_TYRE;
    uint256 requestId = i_vrfCoordinator.requestRandomWords(
      i_gasLane,
      i_subscriptionId,
      REQUEST_CONFIRMATIONS,
      i_callbackGasLimit,
      NUM_WORDS
    );
    emit RequestedRaceWinner(requestId);
    emit RecentBlownTyre(requestId);
    emit RecentFaultyEngine(requestId);
  }

  function fulfillRandomWords(
    uint256, /*requestId*/
    uint256[] memory randomWords
  ) internal override {
    uint256 indexOfWinner = randomWords[0] % s_racers.length;
    address payable recentWinner = s_racers[indexOfWinner];
    s_recentWinner = recentWinner;
    s_raceState = RaceState.OPEN;
    s_carState = CarState.FAULTY_ENGINE;
    s_racers = new address payable[](0);
    s_lastTimeStamp = block.timestamp;
    (bool success, ) = recentWinner.call{value: address(this).balance}("");
    if (!success) {
      revert Race__TransferFailed();
    }
    emit winnerPicked(recentWinner);
  }

  /** Getter Functions */
  function getEntryFee() public view returns (uint256) {
    return i_entryFee;
  }

  function getRaceState() public view returns (RaceState) {
    return s_raceState;
  }

  function getRacer(uint256 index) public view returns (address) {
    return s_racers[index];
  }

  function getRecentWinner() public view returns (address) {
    return s_recentWinner;
  }

  function getCarState() public view returns (CarState) {
    return s_carState;
  }

  function getNumWords() public pure returns (uint256) {
    return NUM_WORDS;
  }

  function getNumberOfRacers() public view returns (uint256) {
    return s_racers.length;
  }

  function getInterval() public view returns (uint256) {
    return i_interval;
  }

  function getLatestTimeStamp() public view returns (uint256) {
    return s_lastTimeStamp;
  }

  function getRequestConfirmations() public pure returns (uint256) {
    return REQUEST_CONFIRMATIONS;
  }
}
