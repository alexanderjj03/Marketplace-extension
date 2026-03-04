// Scrape an individual listing's page

export class ListingAnalyzer {

  constructor(config) {
    this.config = config;
    this.observer = null;
    this.attributes = {};
    this.concerningKeywords = [];
    this.redFlags = [];
    this.scamScore = 0;
    this.conclusion = "";
  }

  getRedFlags() {
    return this.redFlags;
  }

  getScamScore() {
    return this.scamScore;
  }

  getConclusion() {
    return this.conclusion;
  }

  analyzeSingleListing() {
    this.attributes = {};
    this.scamScore = 0;
    this.conclusion = "";
    let pageConfig = 0;
    // 0 indicates viewing the listing from the listings page, 1 indicates opening the listing in a new tab
    // (DOM structure differs :/)

    const root1 = document.querySelector('[aria-label="Marketplace Listing Viewer"]');
    const root2 = document.querySelector('[aria-label="Marketplace sidebar"]')
        .parentNode.querySelector('[role="main"]');

    let inline;
    if (root1) {
      inline = root1.querySelector('[style="display: inline;"]');
    } else if (root2) {
      inline = root2.querySelector('[style="display:inline"]');
      pageConfig = 1;
    } else {
      return "unable to extract data";
    }

    const attributeElems = inline.children[1].children[0].children[1].children[0].children[1 - pageConfig].children[0];
    // No identifiers beyond changing class names to go off of.
    // This will do for now but we will need a more stable solution.

    this.getAttributes(attributeElems.children); // attributes should be a dictionary.
    console.log(this.attributes);
    this.analyzeAttrs();
  }

  // Extracting the relevant attributes of the listing
  getAttributes(elems) {
    //let types = ["general", "vehicle", "property rental", "property sale"];

    if (elems.length >= 15) {
      this.getProperty(elems);
    } else if (elems.length >= 8) {
      this.attributes["type"] = "vehicle";
      this.getVehicle(elems);
    } else if (elems.length >= 3) {
      this.attributes["type"] = "general";
      this.getGeneral(elems);
    }
  }

  getGeneral(elems) {
    let targetNode = elems[0].children[0].children[2];
    const postedDate = targetNode.querySelector('[dir="auto"]').children[0];
    this.attributes["date"] = postedDate.querySelector('abbr').getAttribute('aria-label');

    this.attributes["description"] = this.extractText(elems[0].children[4].children[0].children[1].children[1],
        false);
    this.attributes["condition"] = "N/A";

    let conditionNode = elems[0].children[4].children[0].children[1].children[0];
    conditionNode.childNodes.forEach((row) => {
      let labels = row.querySelectorAll('[dir="auto"]');
      if (labels[0].textContent.toLowerCase() === "condition") {
        this.attributes["condition"] = labels[1].textContent.toLowerCase();
      }
    });

    let userInfo = this.extractUserInfo(elems[1]);
    this.attributes["user join year"] = userInfo[0];
    this.attributes["user rating"] = userInfo[1];
  }

  getVehicle(elems) {
    let targetNode = elems[0].children[2];
    const postedDate = targetNode.querySelector('[dir="auto"]').children[0];
    this.attributes["date"] = postedDate.querySelector('abbr').getAttribute('aria-label');

    this.attributes["description"] = this.extractText(elems[5].children[1].children[0].children[0], true);

    let driven = this.extractText(elems[4].children[1], false);
    this.attributes["distance driven"] = driven.toLowerCase().split("driven ")[1];

    let userInfo = this.extractUserInfo(elems[6]);
    this.attributes["user join year"] = userInfo[0];
    this.attributes["user rating"] = userInfo[1];
  }

  getProperty(elems) {
    let type = this.extractText(elems[0].children[2], false);
    this.attributes["type"] = ((type.toLowerCase() === "home sales") ? "property sale" : "property rental");
    let listedText = this.extractText(elems[1].children[0].lastChild, false);
    this.attributes["date"] = (listedText.toLowerCase().split(" ago")[0]).split("listed ")[1];

    this.attributes["description"] = this.extractText(elems[7].children[1].children[0].children[0], true);
    // Mutation observer needed

    let userInfo = this.extractUserInfo(elems[13]);
    this.attributes["user join year"] = userInfo[0];
    this.attributes["user rating"] = userInfo[1];
  }

  // For extracting text from the page. Adds an observer to the text node if specified
  extractText(elem, addObserver) {
    // Implement a mutation observer for the text content. NOT NEEDED for general listings (only vehicle/property)
    const target = elem.querySelector('[dir="auto"]');

    if (addObserver) {
      if (this.observer) {
        this.observer.disconnect();
      }

      const button = target.querySelector('[role="button"]');
      if (button && button.textContent === 'See more') {
        button.style.cssText = 'background:#ffdddd;';
      }

      this.observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if ((mutation.type === 'characterData') &&
              (target.textContent.length > this.attributes["description"].length)) {
            this.attributes["description"] = target.textContent;
            button.style.cssText = '';
            this.analyzeAttrs();
          }
          console.log(this.attributes);
        });
      });

      this.observer.observe(target, {
        characterData: true,
        subtree: true
      });
    }

    return target.textContent;
  }

  // Extract the user's join year and whether they're highly rated on marketplace or not.
  extractUserInfo(elem) {
    let ret = ["", false]
    let list = elem.querySelector('[role="list"]').childNodes;

    for (let i = 1; i < list.length; i++) {
      let text = this.extractText(list[i], false).toLowerCase();
      if (text.includes("highly rated ")) {
        ret[1] = true;
      } else if (text.includes("joined facebook ")) {
        ret[0] = parseInt(text.split("in ")[1]);
      }
    }

    return ret // user join year, user marketplace rating (yes/no = "highly rated"/not highly rated)
  }

  analyzeAttrs() {
    const currentYear = new Date().getFullYear();
    this.scamScore = 0; // Needs to be placed here in case the description's text is updated
    this.concerningKeywords = [];
    this.redFlags = [];
    this.conclusion = "";

    if (!this.attributes["user rating"]) {
      this.scamScore += 0.15;
      this.redFlags.push("Non-reputable seller")
    }

    // 1 if user join year is last year, 4 if user join year is this year.
    let recencyIndex = Math.pow(Math.max(this.attributes["user join year"] - currentYear + 2, 0), 2);
    this.scamScore += (0.075 * recencyIndex);
    if (recencyIndex === 4) {
      this.redFlags.push("Brand new account")
    }

    // Scam keywords (Replace with regex expressions)
    let descriptionLower = this.attributes["description"].toLowerCase();
    const t1Keywords = ["act fast", "act now", "urgent", "limited time offer", "cash app", "cashapp",
      "no viewing", "bitcoin", "ethereum", "crypto", "pay with gift card"];

    const t2Keywords = ["paypal", "or best offer", "obo", "hold it", "gift card", "refurbished"];

    t1Keywords.forEach((t1) => {
      if (descriptionLower.includes(t1)) {
        this.scamScore += 0.10;
        this.concerningKeywords.push(t1);
      }
    });

    t2Keywords.forEach((t2) => {
      if (descriptionLower.includes(t2)) {
        this.scamScore += 0.05;
        this.concerningKeywords.push(t2);
        if (t2 === "or best offer" || t2 === "obo") {
          this.redFlags.push("You will likely be pressured to pay more than listed price.");
        }
      }
    });

    // Vehicle mileage
    if (this.attributes["type"] === "vehicle") {
      let mileage = this.attributes["distance driven"].replace(",", "").split(" ");
      let num = parseInt(mileage[0]);
      if (mileage[1] !== "km") {
        num *= 1.6;
      }

      if (num > 200000) {
        this.redFlags.push("High mileage. Poor resale value");
      }
    }

    let listedDate = this.attributes["date"].replace(" ago", "").replace("over ", "").split(" ");
    if (listedDate[1].includes("year") || (listedDate[1] === "weeks" && parseInt(listedDate[0]) > 2)) {
      this.redFlags.push("Seller either rarely checks facebook, or no one wants this for a reason.")
    }

    if (descriptionLower.includes("negotiable")) {
      this.scamScore *= 0.75;
    }

    if (this.scamScore <= 0.2) {
      this.conclusion = "Most likely safe.";
    } else if (this.scamScore <= 0.4) {
      this.conclusion = "Scam possible, proceed with caution.";
    } else {
      this.conclusion = "Scam likely. Use extreme caution or find a different listing.";
    }

    this.displayResults();
  }

  displayResults() {
    const resultsDiv = document.getElementById('analysis-results-container');
    if (!resultsDiv) {
      console.error("Results container not found");
      return;
    }
    resultsDiv.textContent = ""; // Clear previous results

    resultsDiv.innerHTML = `
      <p><strong>Disclaimer:</strong> This does not take price analysis results into consideration. 
      If the price is flagged as too good to be true, it may be a scam.</p>
      <p><strong>Scam Score:</strong> ${(this.scamScore * 100).toFixed(2)}%</p>
      <p><strong>Conclusion:</strong> ${this.conclusion}</p>
      <p><strong>Red Flags:</strong> ${this.redFlags.length > 0 ? this.redFlags.join("; ") : "None"}</p>
      <p><strong>Concerning Keywords:</strong> ${this.concerningKeywords.length > 0 ? this.concerningKeywords.join(", ") : "None"}</p>
    `;
  }
}