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
  console.log(attributeElems.children.length);

  let attributes = getAttributes(attributeElems.children); // attributes should be a dictionary.
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

  // more stuff: description, user join year, condition (if present) user marketplace rating (if any)

  return attrs
}

function getVehicle(attrs, elems) {
  let targetNode = elems[0].children[2];
  const postedDate = targetNode.querySelector('[dir="auto"]').children[0];
  attrs["date"] = postedDate.querySelector('abbr').getAttribute('aria-label');

  // more stuff: description, user join year, condition (if present) user marketplace rating (if any)

  return attrs
}

function getProperty(attrs, elems) {
  let targetNode = elems[0].children[2];
  let type = targetNode.querySelector('[dir="auto"]').textContent;
  attrs["type"] = ((type.toLowerCase() === "home sales") ? "property sale" : "property rental");

  // more stuff: date, description, user join year, condition (if present) user marketplace rating (if any)

  return attrs
}

function analyzeAttrs(attributes) {
  return "";
}