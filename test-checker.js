import runChecker from "./lib/checker.js";

// Run the checker on the current directory
runChecker(process.cwd())
  .then(() => {
    console.log("Typo check completed!");
  })
  .catch((error) => {
    console.error("Error running typo checker:", error);
  });
