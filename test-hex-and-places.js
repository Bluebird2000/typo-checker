// Test file to verify hex codes and Nigerian states are not flagged as typos

const testStrings = [
  // Hex color codes (should not be flagged)
  "#ffffff",
  "#fff",
  "#000000",
  "#000",
  "#ff0000",
  "#f0f0f0",

  // Hex literals (should not be flagged)
  "0xff",
  "0xffffff",
  "0x000000",

  // Hex without prefix (should not be flagged)
  "ffffff",
  "000000",
  "ff0000",
  "f0f0f0",

  // Nigerian states (should not be flagged)
  "Lagos",
  "Abuja",
  "Kano",
  "Port Harcourt",
  "Ibadan",
  "Benin City",
  "Calabar",
  "Kaduna",
  "Enugu",
  "Abeokuta",
  "Oyo",
  "Ogun",
  "Osun",
  "Ondo",
  "Ekiti",
  "Kwara",
  "Kogi",
  "Niger",
  "Plateau",
  "Nasarawa",
  "Taraba",
  "Adamawa",
  "Borno",
  "Yobe",
  "Bauchi",
  "Gombe",
  "Jigawa",
  "Katsina",
  "Sokoto",
  "Zamfara",
  "Kebbi",
  "Rivers",
  "Bayelsa",
  "Delta",
  "Edo",
  "Cross River",
  "Akwa Ibom",
  "Abia",
  "Imo",
  "Anambra",
  "Ebonyi",

  // Other place names (should not be flagged)
  "New York",
  "South Africa",
  "United States",
  "United Kingdom",
  "Hong Kong",
  "New Zealand",

  // Words that should be flagged as typos
  "helllo", // typo of "hello"
  "worlld", // typo of "world"
  "functiion", // typo of "function"
];

// Create test strings in various contexts
const testCode = `
const colors = {
  primary: "#ff0000",
  secondary: "#00ff00", 
  background: "#ffffff",
  text: "#000000",
  accent: "#f0f0f0"
};

const hexValues = {
  red: 0xff0000,
  green: 0x00ff00,
  blue: 0x0000ff,
  white: 0xffffff,
  black: 0x000000
};

const hexStrings = [
  "ffffff",
  "000000", 
  "ff0000",
  "f0f0f0"
];

const locations = {
  nigeria: {
    states: [
      "Lagos",
      "Abuja",
      "Kano", 
      "Port Harcourt",
      "Ibadan",
      "Benin City",
      "Calabar",
      "Kaduna",
      "Enugu",
      "Abeokuta",
      "Oyo",
      "Ogun",
      "Osun",
      "Ondo",
      "Ekiti",
      "Kwara",
      "Kogi",
      "Niger",
      "Plateau",
      "Nasarawa",
      "Taraba",
      "Adamawa",
      "Borno",
      "Yobe",
      "Bauchi",
      "Gombe",
      "Jigawa",
      "Katsina",
      "Sokoto",
      "Zamfara",
      "Kebbi",
      "Rivers",
      "Bayelsa",
      "Delta",
      "Edo",
      "Cross River",
      "Akwa Ibom",
      "Abia",
      "Imo",
      "Anambra",
      "Ebonyi"
    ]
  },
  otherPlaces: [
    "New York",
    "South Africa", 
    "United States",
    "United Kingdom",
    "Hong Kong",
    "New Zealand"
  ]
};

// These should be flagged as typos
const typos = [
  "helllo",
  "worlld", 
  "functiion"
];
`;

console.log("Test file created with hex codes and Nigerian states");
console.log("Run: npx typo-checker to test the improvements");
