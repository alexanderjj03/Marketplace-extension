// Scrape an individual listing's page
export function analyzeSingleListing(config) {
  let conclusion = 'f';
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

  let attributes = getAttributes(attributeElems.children); // attributes should be a dictionary.
  console.log(attributes);
  conclusion = analyzeAttrs(attributes);

  return conclusion;
}

function getAttributes(elems) {
  //let types = ["general", "vehicle", "property rental", "property sale"];
  let attrs = {};

  if (elems.length === 3) {
    attrs["type"] = "general";
    attrs = getGeneral(attrs, elems);
  } else if (elems.length === 8) {
    attrs["type"] = "vehicle";
    attrs = getVehicle(attrs, elems);
  } else if (elems.length === 15) {
    attrs = getProperty(attrs, elems);
  }

  return attrs;
}

function getGeneral(attrs, elems) {
  let targetNode = elems[0].children[0].children[2];
  const postedDate = targetNode.querySelector('[dir="auto"]').children[0];
  attrs["date"] = postedDate.querySelector('abbr').getAttribute('aria-label');

  attrs["description"] = extractText(elems[0].children[4].children[0].children[1].children[1]);
  attrs["condition"] = "N/A";

  let conditionNode = elems[0].children[4].children[0].children[1].children[0];
  conditionNode.childNodes.forEach((row) => {
    let labels = row.querySelectorAll('[dir="auto"]');
    if (labels[0].textContent.toLowerCase() === "condition") {
      attrs["condition"] = labels[1].textContent.toLowerCase();
    }
  });

  let userInfo = extractUserInfo(elems[1]);
  attrs["user join year"] = userInfo[0];
  attrs["user rating"] = userInfo[1];

  return attrs
}

function getVehicle(attrs, elems) {
  let targetNode = elems[0].children[2];
  const postedDate = targetNode.querySelector('[dir="auto"]').children[0];
  attrs["date"] = postedDate.querySelector('abbr').getAttribute('aria-label');

  attrs["description"] = extractText(elems[5].children[1].children[0].children[0]);
  // Mutation observer needed

  let driven = extractText(elems[4].children[1]);
  attrs["distance driven"] = driven.toLowerCase().split("driven ")[1];

  let userInfo = extractUserInfo(elems[6]);
  attrs["user join year"] = userInfo[0];
  attrs["user rating"] = userInfo[1];

  return attrs
}

function getProperty(attrs, elems) {
  let type = extractText(elems[0].children[2]);
  attrs["type"] = ((type.toLowerCase() === "home sales") ? "property sale" : "property rental");
  let listedText = extractText(elems[1].children[0].children[1]);
  attrs["date"] = (listedText.toLowerCase().split(" ago")[0]).split("listed ")[1];

  attrs["description"] = extractText(elems[7].children[1].children[0].children[0]);
  // Mutation observer needed

  let userInfo = extractUserInfo(elems[13]);
  attrs["user join year"] = userInfo[0];
  attrs["user rating"] = userInfo[1];

  return attrs
}

// starts just above aria-hidden = false
// PROBLEM: Only the shortened form of the description is extracted (the user has to press the "see more" button).
// Not too important of an issue for now.
function extractText(elem) {
  // Implement a mutation observer for the text content. NOT NEEDED for general listings (only vehicle/property)
  const target = elem.querySelector('[dir="auto"]');
  return target.textContent;
}

function extractUserInfo(elem) {
  let ret = ["", "no"]
  let list = elem.querySelector('[role="list"]').childNodes;

  for (let i = 1; i < list.length; i++) {
    let text = extractText(list[i]).toLowerCase();
    if (text.includes("highly rated ")) {
      ret[1] = "yes";
    } else if (text.includes("joined facebook ")) {
      ret[0] = parseInt(text.split("in ")[1]);
    }
  }

  return ret // user join year, user marketplace rating (yes/no = "highly rated"/not highly rated)
}

function analyzeAttrs(attributes) {
  return "";
}