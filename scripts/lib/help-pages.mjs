// About, Contact, Privacy Policy, Terms and Disclaimer — in Hindi and English.
// Google AdSense asks for these pages. Change the text here if anything about the site changes.
export function HELP_PAGES(site) {
  const mail = `<a href="mailto:${site.email}">${site.email}</a>`;
  const updated = site.analytics?.ga4 ? "4 November 2026" : "3 November 2026";
  // only when Google Analytics is switched on in config/site.json
  const gaHi = site.analytics?.ga4
    ? `<h2>विज़िटर गिनती (Google Analytics)</h2>
<p>यह जानने के लिए कि कितने लोग साइट पढ़ते हैं और कौन-सी खबरें खोलते हैं, हम Google Analytics इस्तेमाल करते हैं। यह कुकीज़ से आपके ब्राउज़र, डिवाइस, अनुमानित जगह (शहर/राज्य) और देखे गए पेजों की जानकारी Google को भेजता है। हम इससे किसी व्यक्ति को नहीं पहचानते। इसे बंद करने के लिए: <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener">Google Analytics opt-out add-on</a>, या ब्राउज़र में कुकीज़ बंद करें। ज़्यादा जानकारी: <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">Google हमारे पार्टनर की साइटों के डेटा का इस्तेमाल कैसे करता है</a>।</p>
`
    : "";
  const gaEn = site.analytics?.ga4
    ? `<h2>Visitor statistics (Google Analytics)</h2>
<p>To know how many people read the site and which stories they open, we use Google Analytics. With cookies it sends Google information about your browser, device, approximate location (city/state) and the pages you view. We don't use it to identify anyone. To turn it off: the <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener">Google Analytics opt-out add-on</a>, or block cookies in your browser. More: <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">How Google uses information from sites that use its services</a>.</p>
`
    : "";
  return [
    {
      slug: "about",
      title: "About · हमारे बारे में",
      hi: `<h1>हमारे बारे में</h1>
<p><b>The Simplest News</b> (${site.domain}) पर हर खबर सबसे छोटे और आसान शब्दों में मिलती है — हिंदी और अंग्रेज़ी दोनों में।</p>
<h2>यह कैसे काम करता है</h2>
<ul>
<li>हर 30 मिनट में हमारा रोबोट भारत की बड़ी समाचार वेबसाइटों की RSS फ़ीड पढ़ता है — देश, दुनिया, राज्य और ज़िलों की खबरें।</li>
<li>Google Gemini (AI) हर खबर का सबसे छोटा शीर्षक लिखता है और 9 सवालों के जवाब देता है: क्या, कौन, किसे, किसका, कहां, कब, क्यों, कौन-सा, कैसे।</li>
<li>हम मूल खबर कॉपी नहीं करते। हर खबर के साथ मूल वेबसाइट का लिंक होता है, ताकि आप पूरी खबर वहीं पढ़ सकें।</li>
<li>जो वेबसाइट robots.txt से रोबोट को मना करती हैं, उनके पेज हम नहीं पढ़ते।</li>
<li>उत्तर प्रदेश, बिहार, मध्य प्रदेश, राजस्थान, दिल्ली, हरियाणा, झारखंड, उत्तराखंड, छत्तीसगढ़ और हिमाचल प्रदेश की ज़िला और तहसील स्तर की खबरें भी।</li>
</ul>
<p>AI से गलती हो सकती है। ज़रूरी फ़ैसले से पहले मूल खबर ज़रूर पढ़ें। गलती दिखे तो ${mail} पर बताएं।</p>`,
      en: `<h1>About us</h1>
<p><b>The Simplest News</b> (${site.domain}) gives you every story in the shortest, simplest words — in Hindi and in English.</p>
<h2>How it works</h2>
<ul>
<li>Every 30 minutes our robot reads the RSS feeds of major Indian news websites — national, world, state and district news.</li>
<li>Google Gemini (AI) writes the shortest headline for each story and answers 9 questions: what, who, whom, whose, where, when, why, which and how.</li>
<li>We don't copy the original story. Every story links to the original website, where you can read it in full.</li>
<li>We don't read pages of websites that ask robots to stay away (robots.txt).</li>
<li>District and tehsil news for Uttar Pradesh, Bihar, Madhya Pradesh, Rajasthan, Delhi, Haryana, Jharkhand, Uttarakhand, Chhattisgarh and Himachal Pradesh.</li>
</ul>
<p>AI can make mistakes. Please read the original story before any important decision. Found a mistake? Write to ${mail}.</p>`,
    },
    {
      slug: "contact",
      title: "Contact · संपर्क",
      hi: `<h1>संपर्क करें</h1>
<p>ईमेल: ${mail}</p>
<h2>गलती, शिकायत या खबर हटाने का अनुरोध</h2>
<p>किसी खबर के सार में गलती हो, या आप किसी समाचार संस्था की ओर से अपनी खबर हटवाना चाहते हैं, तो खबर का लिंक भेजें। हम 24 घंटे में जवाब देने और 15 दिन में शिकायत सुलझाने की कोशिश करते हैं।</p>
<h2>शिकायत अधिकारी (Grievance Officer)</h2>
<p>The Simplest News टीम · ${mail}</p>`,
      en: `<h1>Contact us</h1>
<p>Email: ${mail}</p>
<h2>Mistakes, complaints and removal requests</h2>
<p>If a summary has a mistake, or you represent a news organisation and want a story removed, send us the link. We aim to reply within 24 hours and to resolve complaints within 15 days.</p>
<h2>Grievance Officer</h2>
<p>The Simplest News team · ${mail}</p>`,
    },
    {
      slug: "privacy",
      title: "Privacy Policy · प्राइवेसी पॉलिसी",
      hi: `<h1>प्राइवेसी पॉलिसी</h1>
<p>अपडेट: ${updated}</p>
<h2>आपकी जगह (Location)</h2>
<p>आसपास, तहसील, ज़िला और राज्य की खबरें दिखाने के लिए:</p>
<ul>
<li>अगर आप "मेरी सही जगह (GPS)" दबाकर इजाज़त देते हैं, तो आपका ब्राउज़र आपकी जगह के निर्देशांक BigDataCloud (और ज़रूरत पड़ने पर OpenStreetMap Nominatim) को भेजता है, ताकि आपके गांव/कस्बे, तहसील और ज़िले का नाम पता चले।</li>
<li>GPS के बिना, BigDataCloud आपके इंटरनेट पते (IP) से आपकी अनुमानित जगह बताता है।</li>
<li>आपकी जगह सिर्फ़ आपके अपने फ़ोन/कंप्यूटर (ब्राउज़र की localStorage) में रहती है। हम उसे अपने पास नहीं रखते।</li>
</ul>
<h2>आपकी पसंद</h2>
<p>भाषा, लाइट/डार्क, और "आपकी पसंद" क्रम के लिए आपने कौन-सी खबरें खोलीं — यह सब सिर्फ़ आपके ब्राउज़र में रहता है।</p>
<h2>खोज (Search)</h2>
<p>आप जो शब्द खोजते हैं, उनसे हमारी अपनी खबरें आपके ब्राउज़र में ही खोजी जाती हैं। दूसरी न्यूज़ वेबसाइटों की खबरें दिखाने के लिए आपके खोजे गए अंग्रेज़ी शब्द GDELT Project (api.gdeltproject.org, एक मुफ़्त और खुला समाचार डेटाबेस) को भी भेजे जाते हैं; हर वेबसाइट की तरह वह आपका इंटरनेट पता (IP) देख सकता है। "Google News पर देखें" दबाने पर वही शब्द Google News पर खुलते हैं। हम आपकी खोजें अपने पास नहीं रखते।</p>
<h2>फ़ोटो और वीडियो</h2>
<p>खबरों की फ़ोटो मूल समाचार वेबसाइटों की हैं और छोटे आकार में wsrv.nl सेवा से लोड होती हैं। YouTube वीडियो आपके टैप करने पर ही youtube-nocookie.com से चलता है। वेबसाइट का फ़ॉन्ट (Mukta) Google Fonts से लोड होता है।</p>
<h2>विज्ञापन (Google AdSense)</h2>
<p>हम Google AdSense से विज्ञापन दिखाते हैं। Google समेत तीसरे पक्ष के विक्रेता कुकीज़ का इस्तेमाल करके आपकी इस वेबसाइट या दूसरी वेबसाइटों पर पिछली विज़िट के आधार पर विज्ञापन दिखाते हैं। Google की विज्ञापन कुकीज़ से Google और उसके पार्टनर आपको इस साइट और इंटरनेट की दूसरी साइटों पर विज़िट के आधार पर विज्ञापन दिखा पाते हैं। आप <a href="https://www.google.com/settings/ads" rel="noopener">Google Ads Settings</a> पर जाकर पर्सनलाइज़्ड विज्ञापन बंद कर सकते हैं। ज़्यादा जानकारी: <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">Google हमारे पार्टनर की साइटों के डेटा का इस्तेमाल कैसे करता है</a>।</p>
${gaHi}<h2>होस्टिंग</h2>
<p>यह वेबसाइट GitHub Pages पर चलती है। GitHub सुरक्षा के लिए विज़िटर का IP पता लॉग कर सकता है।</p>
<h2>बच्चे</h2>
<p>हम जानबूझकर बच्चों की कोई निजी जानकारी नहीं लेते।</p>
<h2>संपर्क</h2>
<p>${mail}</p>`,
      en: `<h1>Privacy Policy</h1>
<p>Updated: ${updated}</p>
<h2>Your location</h2>
<p>To show Local, Tehsil, District and State news:</p>
<ul>
<li>If you tap "Use my exact place (GPS)" and allow it, your browser sends your coordinates to BigDataCloud (and, if needed, OpenStreetMap Nominatim) to find the name of your village/town, tehsil and district.</li>
<li>Without GPS, BigDataCloud estimates your approximate area from your internet (IP) address.</li>
<li>Your area is kept only on your own phone or computer (the browser's localStorage). We don't store it.</li>
</ul>
<h2>Your preferences</h2>
<p>Your language, light/dark choice, and the stories you open (used for the "Relevant" order) stay only in your browser.</p>
<h2>Search</h2>
<p>The words you search for are looked up in our own news inside your browser. To show news from other news websites, your English search words are also sent to the GDELT Project (api.gdeltproject.org, a free and open news database); like any website, it can see your internet (IP) address. Tapping "See all news … on Google News" opens the same words on Google News. We don't keep your searches.</p>
<h2>Photos and videos</h2>
<p>Story photos belong to the original news websites and load in a small size through the wsrv.nl service. A YouTube video plays from youtube-nocookie.com only when you tap it. The website's font (Mukta) loads from Google Fonts.</p>
<h2>Advertising (Google AdSense)</h2>
<p>We show ads from Google AdSense. Third-party vendors, including Google, use cookies to serve ads based on a user's prior visits to this website or other websites. Google's use of advertising cookies enables it and its partners to serve ads to users based on their visit to this site and/or other sites on the Internet. You can opt out of personalised advertising in <a href="https://www.google.com/settings/ads" rel="noopener">Google Ads Settings</a>. More: <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">How Google uses information from sites that use its services</a>.</p>
${gaEn}<h2>Hosting</h2>
<p>This website runs on GitHub Pages. GitHub may log visitors' IP addresses for security.</p>
<h2>Children</h2>
<p>We don't knowingly collect personal information from children.</p>
<h2>Contact</h2>
<p>${mail}</p>`,
    },
    {
      slug: "terms",
      title: "Terms · शर्तें",
      hi: `<h1>इस्तेमाल की शर्तें</h1>
<ul>
<li>यहां हर खबर का छोटा सार AI ने लिखा है। इसमें गलती हो सकती है; पूरी और सही जानकारी के लिए मूल खबर पढ़ें।</li>
<li>मूल खबरें, फ़ोटो और वीडियो उनके प्रकाशकों के हैं। छोटे सार और 9 जवाब © The Simplest News।</li>
<li>इस वेबसाइट की सामग्री को बड़ी मात्रा में कॉपी या स्क्रैप करना मना है।</li>
<li>दूसरी वेबसाइटों के लिंक की सामग्री के लिए हम ज़िम्मेदार नहीं हैं।</li>
<li>ये शर्तें भारत के कानून के अनुसार हैं।</li>
</ul>`,
      en: `<h1>Terms of use</h1>
<ul>
<li>Every short summary here is written by AI. It can contain mistakes; read the original story for complete and correct information.</li>
<li>Original stories, photos and videos belong to their publishers. The short summaries and 9 answers are © The Simplest News.</li>
<li>Copying or scraping this website's content in bulk is not allowed.</li>
<li>We are not responsible for the content of other websites we link to.</li>
<li>These terms are governed by the laws of India.</li>
</ul>`,
    },
    {
      slug: "disclaimer",
      title: "Disclaimer · अस्वीकरण",
      hi: `<h1>अस्वीकरण</h1>
<p>The Simplest News पर खबरें दूसरी समाचार वेबसाइटों से ली जाती हैं और AI (Google Gemini) उनका छोटा सार लिखता है। हम हर सार की जांच इंसान से नहीं कराते, इसलिए गलती हो सकती है।</p>
<p>शेयर बाज़ार, सोना-चांदी, सेहत, नौकरी या कानून से जुड़ी खबरें सिर्फ़ जानकारी के लिए हैं — यह निवेश, डॉक्टरी या कानूनी सलाह नहीं है। सोना-चांदी के पुराने भाव अनुमानित हो सकते हैं।</p>
<p>कोई खबर गलत लगे या हटवानी हो तो ${mail} पर लिखें।</p>`,
      en: `<h1>Disclaimer</h1>
<p>News on The Simplest News comes from other news websites, and AI (Google Gemini) writes the short summaries. Summaries are not checked by a person, so they can contain mistakes.</p>
<p>Stories about the stock market, gold and silver, health, jobs or law are for information only — not investment, medical or legal advice. Older gold and silver rates may be estimates.</p>
<p>If a story looks wrong or should be removed, write to ${mail}.</p>`,
    },
  ];
}
