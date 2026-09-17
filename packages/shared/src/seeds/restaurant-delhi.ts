import type { MenuDocument } from "../schemas/menu-document.ts";
import { item, major, section } from "./builders.ts";

const halfFull = (half: number, full: number) => [
  { label: "Half", price: major(half) },
  { label: "Full", price: major(full) },
];

const hi = (name: string, description?: string) => ({ hi: description ? { name, description } : { name } });

export const restaurantDelhi: MenuDocument = {
  schemaVersion: 1,
  id: "seed-restaurant-delhi",
  projectId: "seed",
  venueName: "Haveli Rasoi",
  venueType: "restaurant",
  currency: "INR",
  locale: "en-IN",
  primaryLanguage: "en",
  additionalLanguages: ["hi"],
  taxNote: "Prices are exclusive of GST (5%).",
  footerNotes: ["Lunch 12 to 3:30pm · Dinner 7 to 11pm", "Ask us about Jain preparations"],
  sections: [
    section(
      "sec_hr000001",
      "Starters",
      [
        item("itm_hr000001", "Paneer Tikka", major(380), {
          description: "Cottage cheese marinated in hung curd and kashmiri chilli, charred in the tandoor.",
          dietaryTags: ["veg", "spicy_1"],
          allergens: ["milk"],
          translations: hi("पनीर टिक्का", "दही और कश्मीरी मिर्च में मैरिनेट किया पनीर, तंदूर में सेंका हुआ।"),
        }),
        item("itm_hr000002", "Hara Bhara Kebab", major(320), {
          description: "Spinach, green peas and potato patties with mint chutney.",
          dietaryTags: ["veg"],
          translations: hi("हरा भरा कबाब", "पालक, हरी मटर और आलू की टिक्की, पुदीने की चटनी के साथ।"),
        }),
        item("itm_hr000003", "Chicken Malai Tikka", major(480), {
          description: "Chicken in cream, cheese and cashew marinade.",
          dietaryTags: ["non_veg", "contains_nuts"],
          allergens: ["milk", "tree_nuts"],
          translations: hi("चिकन मलाई टिक्का", "क्रीम, चीज़ और काजू के मसाले में चिकन।"),
          isSignature: true,
        }),
        item("itm_hr000004", "Mutton Seekh Kebab", major(540), {
          description: "Minced goat with ginger, green chilli and garam masala on skewers.",
          dietaryTags: ["non_veg", "spicy_2"],
          translations: hi("मटन सीख कबाब", "अदरक, हरी मिर्च और गरम मसाले के साथ सीख पर कीमा।"),
        }),
        item("itm_hr000005", "Amritsari Fish", major(520), {
          description: "Gram flour battered river sole with ajwain.",
          dietaryTags: ["non_veg", "spicy_1"],
          allergens: ["fish"],
          translations: hi("अमृतसरी मछली", "अजवाइन वाले बेसन में लिपटी तली हुई मछली।"),
        }),
      ],
      { translations: { hi: { title: "स्टार्टर" } } },
    ),
    section(
      "sec_hr000002",
      "Mains",
      [
        item("itm_hr000006", "Dal Makhani", major(290), {
          description: "Black lentils slow-cooked overnight with butter and cream.",
          priceVariants: halfFull(290, 480),
          dietaryTags: ["veg"],
          allergens: ["milk"],
          translations: hi("दाल मखनी", "रात भर धीमी आंच पर पकी काली दाल, मक्खन और क्रीम के साथ।"),
          isSignature: true,
          featured: true,
        }),
        item("itm_hr000007", "Jain Dal Tadka", major(260), {
          description: "Yellow lentils tempered with cumin, without onion or garlic.",
          dietaryTags: ["veg", "jain"],
          translations: hi("जैन दाल तड़का", "जीरे का तड़का लगी पीली दाल, बिना प्याज़ और लहसुन।"),
        }),
        item("itm_hr000008", "Palak Paneer", major(320), {
          priceVariants: halfFull(320, 540),
          dietaryTags: ["veg"],
          allergens: ["milk"],
          translations: hi("पालक पनीर"),
        }),
        item("itm_hr000009", "Butter Chicken", major(420), {
          description: "Tandoori chicken in a tomato, butter and cashew gravy.",
          priceVariants: halfFull(420, 720),
          dietaryTags: ["non_veg", "contains_nuts"],
          allergens: ["milk", "tree_nuts"],
          translations: hi("बटर चिकन", "टमाटर, मक्खन और काजू की ग्रेवी में तंदूरी चिकन।"),
        }),
        item("itm_hr000010", "Mutton Rogan Josh", major(480), {
          priceVariants: halfFull(480, 820),
          dietaryTags: ["non_veg", "spicy_2"],
          translations: hi("मटन रोगन जोश"),
        }),
        item("itm_hr000011", "Egg Curry", major(340), {
          description: "Boiled eggs in onion and tomato masala.",
          dietaryTags: ["egg", "spicy_1"],
          allergens: ["eggs"],
          translations: hi("अंडा करी", "प्याज़ और टमाटर के मसाले में उबले अंडे।"),
        }),
      ],
      { translations: { hi: { title: "मुख्य व्यंजन" } } },
    ),
    section(
      "sec_hr000003",
      "Breads",
      [
        item("itm_hr000012", "Tandoori Roti", major(40), { dietaryTags: ["vegan"], allergens: ["cereals_gluten"], translations: hi("तंदूरी रोटी") }),
        item("itm_hr000013", "Butter Naan", major(90), { dietaryTags: ["veg"], allergens: ["cereals_gluten", "milk"], translations: hi("बटर नान") }),
        item("itm_hr000014", "Garlic Naan", major(110), { dietaryTags: ["veg"], allergens: ["cereals_gluten", "milk"], translations: hi("गार्लिक नान") }),
        item("itm_hr000015", "Lachha Paratha", major(90), { dietaryTags: ["veg"], allergens: ["cereals_gluten", "milk"], translations: hi("लच्छा पराठा") }),
      ],
      { translations: { hi: { title: "रोटियाँ" } } },
    ),
    section(
      "sec_hr000004",
      "Rice",
      [
        item("itm_hr000016", "Jeera Rice", major(220), { dietaryTags: ["vegan", "gluten_free"], translations: hi("जीरा राइस") }),
        item("itm_hr000017", "Veg Dum Biryani", major(280), {
          priceVariants: halfFull(280, 460),
          dietaryTags: ["veg", "spicy_1"],
          allergens: ["milk"],
          translations: hi("वेज दम बिरयानी"),
        }),
        item("itm_hr000018", "Chicken Dum Biryani", major(360), {
          description: "Long-grain basmati layered with chicken, saffron and fried onions.",
          priceVariants: halfFull(360, 580),
          dietaryTags: ["non_veg", "spicy_1"],
          allergens: ["milk"],
          translations: hi("चिकन दम बिरयानी", "केसर और तले प्याज़ के साथ बासमती चावल और चिकन की परतें।"),
        }),
      ],
      { translations: { hi: { title: "चावल" } } },
    ),
    section(
      "sec_hr000005",
      "Desserts",
      [
        item("itm_hr000019", "Gulab Jamun", major(160), {
          description: "Warm milk dumplings in rose and cardamom syrup.",
          dietaryTags: ["veg"],
          allergens: ["milk", "cereals_gluten"],
          translations: hi("गुलाब जामुन", "गुलाब और इलायची की चाशनी में गरम गुलाब जामुन।"),
        }),
        item("itm_hr000020", "Rasmalai", major(180), {
          dietaryTags: ["veg", "contains_nuts"],
          allergens: ["milk", "tree_nuts"],
          translations: hi("रसमलाई"),
        }),
        item("itm_hr000021", "Kesar Pista Phirni", major(170), {
          description: "Ground rice pudding with saffron and pistachio, set in clay.",
          dietaryTags: ["veg", "gluten_free", "contains_nuts"],
          allergens: ["milk", "tree_nuts"],
          translations: hi("केसर पिस्ता फिरनी", "केसर और पिस्ता वाली चावल की खीर, मिट्टी के कुल्हड़ में।"),
        }),
      ],
      { translations: { hi: { title: "मिठाई" } } },
    ),
  ],
};
