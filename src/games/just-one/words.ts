// Word pool for Just One. Single-word concrete nouns that a 7-year-old
// and their grandparent would both recognize. Curated for diversity
// across categories (animals, food, places, objects, vehicles, sports,
// nature, fantasy) so a match has variety. Picked at random per round
// with the recent-words guard preventing repeats inside one match.
//
// Static for v1 — same approach as wavelength's concept pairs. Can
// swap to Anthropic generation later if we need more variety, but the
// list below is large enough that a 12-card match almost never repeats.

export const JUST_ONE_WORDS: string[] = [
  // Animals
  "Dog", "Cat", "Horse", "Cow", "Pig", "Sheep", "Chicken", "Duck",
  "Tiger", "Lion", "Bear", "Wolf", "Fox", "Rabbit", "Squirrel", "Mouse",
  "Elephant", "Giraffe", "Zebra", "Monkey", "Kangaroo", "Panda", "Koala",
  "Penguin", "Owl", "Eagle", "Parrot", "Flamingo", "Peacock",
  "Shark", "Whale", "Dolphin", "Octopus", "Crab", "Lobster",
  "Snake", "Lizard", "Turtle", "Frog", "Spider", "Butterfly", "Bee",
  // Food
  "Pizza", "Burger", "Hot Dog", "Sandwich", "Taco", "Burrito", "Sushi",
  "Pasta", "Spaghetti", "Lasagna", "Ramen", "Pancake", "Waffle",
  "Bagel", "Donut", "Cookie", "Cake", "Pie", "Brownie", "Cupcake",
  "Ice Cream", "Popsicle", "Lollipop", "Chocolate", "Marshmallow",
  "Apple", "Banana", "Orange", "Grape", "Strawberry", "Watermelon",
  "Pineapple", "Cherry", "Lemon", "Mango", "Coconut", "Avocado",
  "Carrot", "Broccoli", "Tomato", "Potato", "Corn", "Mushroom",
  "Cheese", "Bread", "Butter", "Honey", "Jam",
  // Drinks
  "Coffee", "Tea", "Milk", "Juice", "Soda", "Lemonade", "Water",
  "Smoothie", "Milkshake",
  // Places
  "Beach", "Mountain", "Forest", "Desert", "Island", "Volcano", "Cave",
  "Castle", "Pyramid", "Lighthouse", "Bridge", "Tower", "Stadium",
  "Library", "Museum", "Hospital", "Airport", "Zoo", "Aquarium",
  "Park", "Playground", "Theater", "Cinema", "Mall", "Bakery",
  "Farm", "Garden", "Greenhouse",
  "Paris", "London", "Tokyo", "Rome", "Venice", "Cairo", "Sydney",
  // Vehicles
  "Car", "Truck", "Bicycle", "Motorcycle", "Scooter", "Skateboard",
  "Train", "Bus", "Taxi", "Ambulance", "Firetruck", "Police Car",
  "Boat", "Sailboat", "Submarine", "Helicopter", "Airplane", "Rocket",
  "Hot Air Balloon", "Tractor",
  // Objects
  "Phone", "Laptop", "Camera", "Television", "Radio", "Clock", "Watch",
  "Book", "Pencil", "Crayon", "Scissors", "Stapler", "Calculator",
  "Hammer", "Screwdriver", "Wrench", "Saw", "Drill", "Ladder",
  "Umbrella", "Sunglasses", "Hat", "Scarf", "Glove", "Boot", "Sock",
  "Backpack", "Wallet", "Suitcase", "Mirror", "Pillow", "Blanket",
  "Lamp", "Candle", "Key", "Lock", "Map", "Compass", "Telescope",
  "Microscope", "Magnet", "Magnifying Glass",
  // Sports + Toys
  "Soccer", "Basketball", "Baseball", "Football", "Tennis", "Golf",
  "Hockey", "Bowling", "Skiing", "Surfing", "Swimming", "Cycling",
  "Yoga", "Karate",
  "Lego", "Puzzle", "Kite", "Frisbee", "Yo-Yo", "Slinky", "Tetris",
  "Teddy Bear", "Doll", "Robot",
  // Nature
  "Sun", "Moon", "Star", "Cloud", "Rainbow", "Lightning", "Snow",
  "Rain", "Wind", "Fire", "Ice", "Sand", "Rock", "Tree", "Flower",
  "Grass", "Leaf", "Mushroom", "River", "Lake", "Ocean", "Waterfall",
  // Fantasy / Story
  "Dragon", "Unicorn", "Mermaid", "Wizard", "Witch", "Ghost", "Vampire",
  "Werewolf", "Pirate", "Knight", "Princess", "King", "Queen", "Fairy",
  "Genie", "Alien", "Monster", "Zombie",
  // Music
  "Guitar", "Piano", "Drum", "Violin", "Trumpet", "Flute", "Harp",
  "Saxophone", "Microphone",
  // Holidays / events
  "Birthday", "Wedding", "Christmas", "Halloween", "Easter", "Picnic",
  "Parade",
];
