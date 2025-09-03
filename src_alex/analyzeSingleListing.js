// Scrape an individual listing's page

import {analyzeListings} from "./analyzeListings.js";

export class ListingAnalyzer {

  constructor(config) {
    this.config = config;
    this.observer = null;
    this.attributes = {};
    this.conclusion = "";
  }

  getConclusion() {
    return this.conclusion;
  }

  analyzeSingleListing() {
    this.attributes = {};
    this.conclusion = "";
    let pageConfig = 0;
    // 0 indicates viewing the listing from the listings page, 1 indicates opening the listing in a new tab
    // (DOM structure differs :/)

    const root1 = document.querySelector('[aria-label="Marketplace Listing Viewer"]');
    const root2 = document.querySelector('[aria-label="Collection of Marketplace items"]');

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
    this.analyzeAttrs(this.attributes);
  }

  // Extracting the relevant attributes of the listing
  getAttributes(elems) {
    //let types = ["general", "vehicle", "property rental", "property sale"];

    if (elems.length === 3) {
      this.attributes["type"] = "general";
      this.getGeneral(elems);

    } else if (elems.length === 8) {
      this.attributes["type"] = "vehicle";
      this.getVehicle(elems);

    } else if (elems.length === 15) {
      this.getProperty(elems);
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

    // PROBLEM: Only the shortened form of the description is extracted (the user has to press the "see more" button).
    // Not too important of an issue for now.
    this.attributes["description"] = this.extractText(elems[5].children[1].children[0].children[0], true);
    // Mutation observer needed

    let driven = this.extractText(elems[4].children[1], false);
    this.attributes["distance driven"] = driven.toLowerCase().split("driven ")[1];

    let userInfo = this.extractUserInfo(elems[6]);
    this.attributes["user join year"] = userInfo[0];
    this.attributes["user rating"] = userInfo[1];
  }

  getProperty(elems) {
    let type = this.extractText(elems[0].children[2], false);
    this.attributes["type"] = ((type.toLowerCase() === "home sales") ? "property sale" : "property rental");
    let listedText = this.extractText(elems[1].children[0].children[1], false);
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

      this.observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if ((mutation.type === 'characterData') &&
              (target.textContent.length > this.attributes["description"].length)) {
            this.attributes["description"] = target.textContent;
            this.analyzeAttrs(this.attributes);
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
    let ret = ["", "no"]
    let list = elem.querySelector('[role="list"]').childNodes;

    for (let i = 1; i < list.length; i++) {
      let text = this.extractText(list[i], false).toLowerCase();
      if (text.includes("highly rated ")) {
        ret[1] = "yes";
      } else if (text.includes("joined facebook ")) {
        ret[0] = parseInt(text.split("in ")[1]);
      }
    }

    return ret // user join year, user marketplace rating (yes/no = "highly rated"/not highly rated)
  }

  analyzeAttrs(attributes) {
    this.conclusion = "f";
  }
}