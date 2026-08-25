#!/usr/bin/env node
// Builds the Movie House store catalog:
//  1. Scans the external media disk (movies/ + series/ folders)
//  2. Fetches a poster for every title online (TMDB for movies, TVMaze for series)
//  3. Writes posters to public/posters/
//  4. Emits src-tauri/src/db/catalog_seed.json which the Rust backend seeds
//     into SQLite on startup.
//
// Usage: node scripts/build-catalog.mjs [--skip-posters]
//   MEDIA_ROOT=/path/to/disk  (default: /run/media/destiny/UBUNTU 24_0)

import { readdirSync, statSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";

// Some hosts are unreachable from Node's undici on this machine while curl
// works fine, so all network I/O goes through curl.
function curlText(url) {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      ["-sL", "--max-time", "30", "--retry", "2", "-H", "Accept-Language: en-US,en;q=0.9", url],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    );
  });
}

function curlToFile(url, destFile) {
  return new Promise((resolve, reject) => {
    execFile("curl", ["-sL", "--max-time", "60", "--retry", "2", "-o", destFile, url], (err) =>
      err ? reject(err) : resolve()
    );
  });
}

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MEDIA_ROOT = process.env.MEDIA_ROOT || "/run/media/destiny/UBUNTU 24_0";
const SKIP_POSTERS = process.argv.includes("--skip-posters");
const POSTER_DIR = join(PROJECT_ROOT, "public", "posters");
const SEED_PATH = join(PROJECT_ROOT, "src-tauri", "src", "db", "catalog_seed.json");

const DISK_LABEL = "UBUNTU 24_0 (External)";
const MOVIE_PRICE = 200;
const SERIES_EP_PRICE = 150;

// ─────────────────────────────────────────────────────────────────
// Curated metadata. Keyed by movie code (USxxx) / series folder name.
// cat: category id | min: runtime minutes | q: optional search override
// review: short Myanmar review shown on the customer storefront.
// ─────────────────────────────────────────────────────────────────

const CAT_ACTION = "cat-action"; // existing seed
const CAT_COMEDY = "cat-comedy"; // existing seed
const CAT_HORROR = "cat-horror"; // existing seed "Horror & Thriller"
const CAT_ANIME = "cat-anime"; // existing seed "Anime & Cartoon"
const CAT_SCIFI = "cat-scifi"; // new: Sci-Fi & Fantasy
const CAT_DRAMA = "cat-drama"; // new: Drama & Classics
const CAT_TV = "cat-tv"; // new: Popular TV Series

const EXTRA_CATEGORIES = [
  { id: CAT_SCIFI, name: "Sci-Fi & Fantasy", slug: "sci-fi-fantasy" },
  { id: CAT_DRAMA, name: "Drama & Classics", slug: "drama-classics" },
  { id: CAT_TV, name: "Popular TV Series", slug: "popular-tv-series" },
];

const MOVIES = {
  US001: { year: 2026, min: 133, cat: CAT_SCIFI, review: "ဂြိုဟ်တစ်ခုလုံးရဲ့အနာဂတ်ကို ကယ်တင်ဖို့ အာကာသထဲ တစ်ကိုယ်တော်ပျံသန်းရတဲ့ သိပ္ပံစိတ်ကူးယဉ်ဇာတ်ကား။ မျှော်မထင်တဲ့ အလယ်ဗဟိုကျတဲ့ သူငယ်ချင်းဆိုင်ရာဇာတ်သိမ်းခန်းက နှလုံးသားထဲ ရောက်သွားစေမှာပါ။" },
  US002: { year: 2010, min: 148, cat: CAT_SCIFI, review: "အိပ်မက်ထဲ့အိပ်မက် ဝင်ရောက်ပြီး စိတ်ကူးတွေ စိုးမိုးတဲ့ Nolan ရဲ့ လက်ရာမြောက် စိန်ခေါ်မှုဇာတ်ကား။ နောက်ဆုံးဇာတ်သိမ်းခန်းဟာ ကမ္ဘာကြီးရဲ့ အကောင်းဆုံး အဆုံးသတ်ခန်းတွေထဲမှာ ပါဝင်နေဆဲပါ။" },
  US003: { year: 2014, min: 169, cat: CAT_SCIFI, review: "လူမျိုးနွယ်ကို ကယ်တင်ဖို့ ဒိုင်ဗ်အသစ်ရှာတဲ့ အာကာသခရီးစဉ်။ အဖ-သမီး မေတ္တာနဲ့ သိပ္ပံပညာကို ရောစပ်ထားတဲ့ ရင်ခုန်စရာကောင်းပြီး မျက်ရည်တွေလည်း ကျစေတဲ့ ဇာတ်ကားကောင်းပါ။" },
  US004: { year: 2008, min: 152, cat: CAT_ACTION, review: "Batman ဇာတ်ဝင်ခန်းတွေထဲက အကြီးကျယ်ဆုံး ဇာတ်ကား။ Heath Ledger ရဲ့ Joker အရည်အချင်းဟာ ဒဏ္ဍာရီထဲ ရောက်နေပြီ။ ဆူပူရှုပ်ထွေးတဲ့ Gotham ကြီးထဲမှာ တရားမျှတမှုအတွက် ရုန်းကန်ရတာ စိတ်ဝင်စားစရာကောင်းပါတယ်။" },
  US005: { year: 2023, min: 181, cat: CAT_DRAMA, review: "အက်တမ်ဘုံဘာ ဖန်တီးခဲ့တဲ့ သိပ္ပံပညာရှင် Oppenheimer ရဲ့ ဘဝဇာတ်ကြောင်း။ တီထွင်ဆန္ဒနဲ့ ကိုယ်ကျင့်တရားကြားက တိုက်ပွဲကို Nolan က အလွန်သိပ်သိပ်သွယ်သွယ် ရိုက်ကူးထားပါတယ်။" },
  US006: { year: 2024, min: 166, cat: CAT_SCIFI, review: "Arrakis သဲကန္တာရဂြိုဟ်ပေါ်မှာ Paul Atreides ရဲ့ လက်စားချေရေးနဲ့ ဘာသာရေးအာဏာ တက်လမ်းကို မျက်စိမှုနဲ့မကြည့်နိုင်အောင် လှပတဲ့ visual တွေနဲ့ ရိုက်ကူးထားတဲ့ epic ဇာတ်ကားကြီးပါ။" },
  US007: { year: 2022, min: 192, cat: CAT_SCIFI, review: "Pandora ဂြိုဟ်ရဲ့ ပင်လယ်ရေအောက်ကမ္ဘာကို 3D နည်းပညာနဲ့ အံ့ဩစရာကောင်းအောင် ဖန်တီးထားတယ်။ Jake Sully မိသားစုရဲ့ မိသားစုချစ်ခင်မှုဇာတ်လမ်းက ဇာတ်ကားရဲ့ အဓိကအားသာချက်ပါ။" },
  US008: { year: 2022, min: 130, cat: CAT_ACTION, review: "လေယာဉ်မှူး Maverick ပြန်လာပြီ! လေထဲတိုက်ပွဲခန်းတွေက ပရိသတ်တွေကို လေထဲမှာလိုက်ပျံနေရသလို ခံစားစေတဲ့အတွက် ရုပ်ရှင်ရုံမှာကြည့်သင့်တဲ့ အားကစားဇာတ်ကားပါ။" },
  US009: { year: 2023, min: 140, cat: CAT_ANIME, review: "Spider-Verse ရဲ့ animation အသစ်တွေဟာ အန်နီမေးရှင်းသမိုင်းမှာ အလှဆုံးလက်ရာတွေထဲပါဝင်ပါတယ်။ Miles Morales ရဲ့ ကိုယ်ပိုင်လမ်းကို ရှာဖွေတဲ့ဇာတ်လမ်းက လူငယ်တွေအကြိုက် encounter ဖြစ်ပါလိမ့်မယ်။" },
  US010: { year: 1999, min: 136, cat: CAT_SCIFI, review: "Matrix ကမ္ဘာကြီးထဲ ဝင်ရောက်ပြီး Neo ရဲ့ ရွေးချယ်မှုဇာတ်လမ်း။ sci-fi ဇာတ်ကားတွေရဲ့ အခြေခံအုတ်မြစ်ဖြစ်တဲ့အတွက် ကြည့်ဖူးတဲ့သူတိုင်း မေ့မရနိုင်တဲ့ ဇာတ်ကားကောင်းပါ။" },
  US011: { year: 1994, min: 154, cat: CAT_DRAMA, review: "Quentin Tarantino ရဲ့ အကြောင်းအရာတွေ ကွဲပြားပြီး စိတ်ဝင်စားစရာကောင်းတဲ့ ဇာတ်လမ်းဖွဲ့စည်းပုံဟာ ရုပ်ရှင်သမိုင်းမှာ ထင်ရှားပါတယ်။ စာရိတ်မကောင်းတဲ့သူတွေရဲ့ ဘဝဇာတ်ကြောင်းတွေကို ပြောပြထားတာပါ။" },
  US012: { year: 1999, min: 139, cat: CAT_DRAMA, review: "အိပ်ရာပျက်စေတဲ့ ဇာတ်လမ်းတစ်ပိုင်းနဲ့ လူ့အဖွဲ့အစည်းကို ဝေဖန်တဲ့ ဇာတ်ကား။ နောက်ဆုံး twist ဟာ ပရိသတ်အများစုကို အံ့အားသင့်စေတဲ့အတွက် David Fincher ရဲ့ လက်ရာကောင်းပါ။" },
  US013: { year: 1994, min: 142, cat: CAT_DRAMA, review: "Forrest Gump ဆိုတဲ့ ရိုးသားပြီး စိတ်ကောင်းရှင်တစ်ဦးရဲ့ ဘဝခရီးလမ်းကို သမိုင်းဖြစ်ရပ်တွေနဲ့ ရောစပ်ပြီး ပုံဖော်ထားတာပါ။ အချစ်၊ ဆုံးရှုံးမှု၊ မိသားစု - လူ့ဘဝရဲ့ ခံစားချက်အားလုံးကို ကျွမ်းကျင်စွာ ဖော်ပြထားပါတယ်။" },
  US014: { year: 1994, min: 142, cat: CAT_DRAMA, review: "မှားယွင်းစွာ အပြစ်ပေးခံရတဲ့ Andy Dufresne ရဲ့ ထောင်ထဲက မျှော်လင့်ချက်ဇာတ်လမ်း။ လူ့စိတ်ခံစားချက်ကို အနက်ရှိုင်းဆုံး ထိခိုက်စေတဲ့ ကမ္ဘာ့အကောင်းဆုံးရုပ်ရှင်စာရင်းမှာ အမြဲပါဝင်နေပါတယ်။" },
  US015: { year: 1972, min: 175, cat: CAT_DRAMA, review: "Mafia မိသားစုတစ်ခုရဲ့ အာဏာလမ်းကြောင်းနဲ့ မိသားစုချစ်ခင်မှုကို ဖော်ပြတဲ့ ရုပ်ရှင်သမိုင်းရဲ့ အကြီးကျယ်ဆုံး လက်ရာ။ Marlon Brando နဲ့ Al Pacino တို့ရဲ့ သရုပ်ဆောင်မှုဟာ မထူးခြားနိုင်တော့ပါဘူး။" },
  US016: { year: 2000, min: 155, cat: CAT_ACTION, review: "Rome အင်ပါယာခေတ်က gladiator တိုက်ပွဲဝင်းထဲက လက်စားချေရေးဇာတ်လမ်း။ Russell Crowe ရဲ့ Maximus သရုပ်ဆောင်မှုနဲ့ Hans Zimmer ရဲ့ ဂီတတွေက ဇာတ်ကားကို မမေ့နိုင်တဲ့ အနှစ်ချုပ်ဖြစ်စေပါတယ်။" },
  US017: { year: 1993, min: 127, cat: CAT_ACTION, review: "Dinosaur တွေကို ပြန်လည်ဖန်တီးတဲ့ Spielberg ရဲ့ စိတ်ကူးယဉ်ဇာတ်ကား။ ဒိုင်နိုဆောတွေက ဒီလောက်တိတိကျကျ ဖန်တီးနိုင်မှာကို ၁၉၉၃ မှာ ပရိသတ်အများစု အံ့အားသင့်ခဲ့ကြရပါတယ်။" },
  US018: { year: 1997, min: 195, cat: CAT_DRAMA, review: "Titanic သင်္ဘောနစ်မြုပ်မှုနဲ့ Jack နဲ့ Rose တို့ရဲ့ အတန်းအခွင်းကွာခြားတဲ့ အချစ်ဇာတ်လမ်း။ James Cameron ရဲ့ ဒီလက်ရာဟာ မျိုးဆက်ပြီးမျိုးဆက် ပရိသတ်တွေရဲ့ နှလုံးသားကို ထိခိုက်စေဆဲပါ။" },
  US019: { year: 2003, min: 201, cat: CAT_SCIFI, review: "Middle-earth ကမ္ဘာကြီးရဲ့ အပိုင်းအစအားလုံး ပြီးမြောက်တဲ့ epic ဇာတ်ကားကြီး။ Oscar ၁၁ ဆုရခဲ့တဲ့ ဒီဇာတ်ကားဟာ fantasy ရုပ်ရှင်တွေထဲက အကြီးမားဆုံး အောင်မြင်မှုဖြစ်ပါတယ်။" },
  US020: { year: 1980, min: 124, cat: CAT_SCIFI, review: "\"I am your father\" ဆိုတဲ့ စာကြေးတိုကလေးဟာ ရုပ်ရှင်သမိုင်းရဲ့ အကြီးမားဆုံး twist တွေထဲပါ။ Star Wars saga ထဲက အကောင်းဆုံးဇာတ်ကားလို့ ပရိသတ်အများစုက သတ်မှတ်ကြပါတယ်။" },
  US021: { year: 2019, min: 181, cat: CAT_ACTION, review: "Infinity Saga ရဲ့ အဆုံးသတ်ဇာတ်ကားကြီး။ Marvel ပရိသတ်တွေအတွက် ၁၁ နှစ်တာ စောင့်ဆိုင်းချက်တွေအားလုံးရဲ့ အကောင်းဆုံး တုံ့ပြန်မှုဖြစ်ပြီး ကမ္ဘာ့ box office record တွေစွာ ချိုးနိုင်ခဲ့ပါတယ်။" },
  US022: { year: 1991, min: 118, cat: CAT_HORROR, review: "FBI trainee Clarice နဲ့ လူသတ်သမား Hannibal Lecter တို့ရဲ့ စိတ်ပိုင်းဆိုင်ရာ တိုက်ပွဲ။ Anthony Hopkins ရဲ့ ဒီသရုပ်ဆောင်မှုဟာ horror/thriller သမိုင်းမှာ အကောင်းဆုံးတွေထဲပါပါတယ်။" },
  US023: { year: 1998, min: 169, cat: CAT_DRAMA, review: "WWII Normandy ကမ်းခြေတိုက်ပွဲရဲ့ ပထမ ၂၀ မိနစ်ဟာ ရုပ်ရှင်သမိုင်းမှာ အကြောက်ဆုံး စစ်မှုဇာတ်လမ်းဖော်ပြချက်တွေထဲပါ။ Tom Hanks ရဲ့ တပ်မှူးသရုပ်ဆောင်မှုက နှလုံးသားထဲ ရောက်သွားစေပါတယ်။" },
  US024: { year: 1993, min: 195, cat: CAT_DRAMA, review: "Holocaust အတွင်း ဂျူးလူမျိုး ၁၂၀၀ ကျော်ကို ကယ်တင်ခဲ့တဲ့ Oskar Schindler ရဲ့ ဇာတ်ကြောင်း။ Spielberg ရဲ့ ဒီ black-and-white ဇာတ်ကားဟာ လူသားဆန်မှုရဲ့ အလင်းရောင်ကို အလွန်အမင်း ပြသနေပါတယ်။" },
  US025: { year: 1990, min: 145, cat: CAT_DRAMA, review: "Henry Hill ရဲ့ Mafia ဘဝတက်လမ်းနဲ့ ဆင်းလမ်းကို Scorsese က လက်တွေ့ဆန်ဆန် ရိုက်ကူးထားပါတယ်။ Gangster ဇာတ်ကားတွေထဲမှာ အကောင်းဆုံးလို့ ရုပ်ရှင်ပညာရှင်တွေက အသိအမှတ်ပြုကြပါတယ်။" },
  US026: { year: 2006, min: 151, cat: CAT_DRAMA, review: "Boston ရဲ့ mafia အဖွဲ့အစည်းနဲ့ ရဲတပ်ဖွဲ့ကြားမှာ သူခိုးတွေ ထားရှိတဲ့ Scorsese ရဲ့ thriller။ DiCaprio နဲ့ Matt Damon တို့ရဲ့ တင်းမာတဲ့ သရုပ်ဆောင်မှုကြောင့် Best Picture Oscar ရခဲ့ပါတယ်။" },
  US027: { year: 2014, min: 106, cat: CAT_DRAMA, review: "Jazz drummer တစ်ဦးရဲ့ အနုပညာအောင်မြင်မှုအတွက် ကြိုးစားအားထုတ်မှုဇာတ်လမ်း။ တီးဝိုင်းနာယက Fletcher နဲ့ Andrew ကြားက တင်းကျပ်တဲ့ဆက်ဆံရေးဟာ ပရိသတ်တွေကို အသက်ရှူမသန်စေပါဘူး။" },
  US028: { year: 2016, min: 128, cat: CAT_DRAMA, review: "LA မှာ အနုပညာအလုပ်လုပ်ကြတဲ့ Mia နဲ့ Sebastian တို့ရဲ့ အချစ်ဇာတ်လမ်းကို musical ပုံစံနဲ့ ရိုက်ကူးထားတာပါ။ အနုပညာနဲ့ အချစ်ကြားက ရွေးချယ်မှုတွေက ခံစားမိစေပါတယ်။" },
  US029: { year: 2019, min: 132, cat: CAT_DRAMA, review: "ကြွယ်ဝတဲ့မိသားစုနဲ့ ဆင်းရဲတဲ့မိသားစုကြားက လူမှုရေးအဆင့်အတန်းကွာခြားချက်ကို Bong Joon-ho က ထူးခြားတဲ့ပုံစံနဲ့ ဖော်ပြထားတာပါ။ Oscar Best Picture ရတဲ့ ပထမဆုံး နိုင်ငံခြားဘာသာစကားဇာတ်ကားဖြစ်ပါတယ်။" },
  US030: { year: 2022, min: 139, cat: CAT_SCIFI, review: "Multiverse ကမ္ဘာတွေစွာထဲ လမ်းပျောက်နေတဲ့ Evelyn ရဲ့ ခရီးစဉ်။ စိတ်ကူးယဉ်၊ အက်ရှင်၊ ချစ်ကြည်ဖွယ်ရာ ခံစားချက်တွေကို ရောစပ်ပြီး အံ့ဩစရာကောင်းအောင် ဖန်တီးထားတဲ့ ဇာတ်ကားကောင်းပါ။" },
  US031: { year: 2017, min: 164, cat: CAT_SCIFI, review: "Blade Runner K ရဲ့ လျှို့ဝှက်ချက်ရှာဖွေမှုကို Roger Deakins ရဲ့ အလွန်လှပတဲ့ ရုပ်မြင်သံကြားနည်းပညာနဲ့ ရိုက်ကူးထားပါတယ်။ Sci-fi noir အမျိုးအစားကို အနုပညာအဆင့် တင်ပေးလိုက်တဲ့ ဇာတ်ကားပါ။" },
  US032: { year: 2016, min: 116, cat: CAT_SCIFI, review: "Alien ဘာသာစကားကို ဖြေရှင်းရတဲ့ ဘာသာစကားပညာရှင် Louise ရဲ့ဇာတ်လမ်း။ Sci-fi ဇာတ်ကားတွေထဲမှာ ဉာဏ်ရည်ဉာဏ်သွေးနဲ့ ခံစားချက်ကို အလေးပေးထားတဲ့အတွက် ထူးခြားတဲ့ လက်ရာဖြစ်ပါတယ်။" },
  US033: { year: 2015, min: 144, cat: CAT_SCIFI, review: "Mars ပေါ်မှာ တစ်ကိုယ်တော်ကျန်ရစ်ခဲ့ရတဲ့ astronaut Mark Watney ရဲ့ ရှင်သန်ရေးဇာတ်လမ်း။ သိပ္ပံနည်းပညာနဲ့ ဟာသခံစားချက်ကို ရောစပ်ထားတဲ့အတွက် စိတ်အားတက်စရာကောင်းပါတယ်။" },
  US034: { year: 2014, min: 108, cat: CAT_SCIFI, review: "AI robot Ava ရဲ့ စမ်းသပ်မှုကို လုပ်ဆောင်ရတဲ့ Caleb ရဲ့ဇာတ်လမ်း။ AI ကိုလူသားတွေအကြောင်း ဘယ်လောက်သိနိုင်သလဲဆိုတဲ့ မေးခွန်းကို စိတ်လှုပ်ရှားစရာကောင်းအောင် ဖော်ပြထားပါတယ်။" },
  US035: { year: 2007, min: 122, cat: CAT_HORROR, review: "Coen ညီအကိုတို့ရဲ့ ဒီ western-thriller မှာ Anton Chigurh ဆိုတဲ့ ဆိုင်းဘုတ်မဲ့ လူသတ်သမားဟာ ရုပ်ရှင်သမိုင်းရဲ့ အကြောက်ဆုံး villain တွေထဲပါပါတယ်။ တင်းမာပြီး အေးဆေးတဲ့လေထုဟာ ထူးခြားပါတယ်။" },
  US036: { year: 2007, min: 158, cat: CAT_DRAMA, review: "Oil မြေအောက်မှာ ရှာဖွေတွေ့ရှိတဲ့ Daniel Plainview ရဲ့ လောဘနဲ့ အာဏာတက်လမ်း။ There Will Be Blood ဆိုတဲ့ ဇာတ်ကားရဲ့ အမည်လိုပဲ သွေးထဲက ရုန်းထွက်ဖို့ ကြိုးပမ်းရတဲ့ ဇာတ်ကားဖြစ်ပါတယ်။" },
  US037: { year: 2009, min: 153, cat: CAT_ACTION, review: "WWII အတွင်း Nazi တွေကို လက်စားချေတဲ့ ဂျူးစစ်သားအဖွဲ့ရဲ့ဇာတ်လမ်း။ Tarantino ရဲ့ dialogue ရေးသားမှုဟာ အလွန်ထူးခြားပြီး Christoph Waltz ရဲ့ Landa သရုပ်ဆောင်မှုက Oscar ရခဲ့ပါတယ်။" },
  US038: { year: 2012, min: 165, cat: CAT_ACTION, review: "Slave ဘဝကနေ လွတ်မြောက်ပြီး bounty hunter ဖြစ်လာတဲ့ Django ရဲ့ လက်စားချေရေးဇာတ်လမ်း။ Western အမျိုးအစားကို Tarantino ပုံစံနဲ့ ပြန်လည်ဖန်တီးထားတဲ့ စိတ်အားတက်စရာကောင်းပါတယ်။" },
  US039: { year: 2006, min: 130, cat: CAT_DRAMA, review: "Victorian ခေတ် magician နှစ်ယောက်ရဲ့ ပြိုင်ဆိုင်မှုက လူသားချင်းဆိုင်ရာ စိန်ခေါ်မှုအဆင့် ရောက်သွားတဲ့ဇာတ်လမ်း။ Nolan ရဲ့ အချိန်ဇယားဖွဲ့စည်းမှုဟာ နောက်ဆုံးမှာ ပရိသတ်ကို အံ့အားသင့်စေပါတယ်။" },
  US040: { year: 2000, min: 113, cat: CAT_HORROR, review: "မှတ်ဥပမာဆုံးရှုံးနေတဲ့ Leonard ရဲ့ ဇနီးလက်စားချေရေးဇာတ်လမ်းကို နောက်ပြန်စဉ်ဆက်ပုံစံနဲ့ ဖော်ပြထားတာပါ။ ကြည့်ပြီးရင်တောင် အကြိမ်ကြိမ် ပြန်ကြည့်ချင်စေတဲ့ ဇာတ်ကားကောင်းပါ။" },
  US041: { year: 2010, min: 138, cat: CAT_HORROR, review: "Shutter Island ဆေးရုံမှာ လူသတ်သမားရှာဖွေရာကနေ Teddy ရဲ့ စိတ်ကမ္ဘာ ပြဿနာတွေ ပေါ်လာတဲ့ Scorsese ရဲ့ psychological thriller။ DiCaprio ရဲ့သရုပ်ဆောင်မှုက အလွန်ခံစားစရာကောင်းပါတယ်။" },
  US042: { year: 2010, min: 120, cat: CAT_DRAMA, review: "Facebook ကို တီထွင်ခဲ့တဲ့ Mark Zuckerberg ရဲ့ Harvard ဘဝကနေ ကမ္ဘာကြီးအားလုံးကို ပြောင်းလဲပစ်တဲ့အထိ ဇာတ်လမ်း။ Fincher ရဲ့ ရိုက်ကူးမှုနဲ့ Sorkin ရဲ့ dialogue တွေက အလွန်ချောမွေ့ပါတယ်။" },
  US043: { year: 2013, min: 180, cat: CAT_COMEDY, review: "Wall Street မှာ လောဘကြီးတဲ့ stockbroker Jordan Belfort ရဲ့ တက်လမ်းနဲ့ ကျဆုံးလမ်း။ Scorsese နဲ့ DiCaprio တို့ရဲ့ ပူးတွဲလက်ရာဟာ ၃ နာရီကြာပေမယ့် မငြီးငွေ့စေပါဘူး။" },
  US044: { year: 2015, min: 120, cat: CAT_ACTION, review: "George Miller ရဲ့ dystopian ကမ္ဘာက လမ်းပေါ်တိုက်ပွဲခန်းတွေက practical effects တွေနဲ့ အံ့အားသင့်စရာကောင်းပါတယ်။ Furiosa နဲ့ Max တို့ရဲ့ ခရီးစဉ်ဟာ action ဇာတ်ကားတွေရဲ့ စံနမူနာဖြစ်ပါတယ်။" },
  US045: { year: 2018, min: 117, cat: CAT_ANIME, review: "Miles Morales ကို Spider-Man ဖြစ်လာစေတဲ့ ခရီးစဉ်။ Animation ပုံစံဟာ comic book ခံစားချက်ကို အလွန်ကောင်းအောင် ဖန်တီးထားပြီး Oscar Best Animated Feature ရခဲ့ပါတယ်။" },
  US046: { year: 2017, min: 105, cat: CAT_ANIME, review: "Mexico ရဲ့ Día de los Muertos အခမ်းအနားနဲ့ မိသားစုချစ်ခင်မှုကို Pixar က နှလုံးသားကို ထိခိုက်စေတဲ့ပုံစံနဲ့ ဖော်ပြထားပါတယ်။ \"Remember Me\" သီချင်းက မျက်ရည်တွေ ချောင်းဆိုးစေပါလိမ့်မယ်။" },
  US047: { year: 2015, min: 95, cat: CAT_ANIME, review: "၁၁ နှစ်အရွယ် Riley ရဲ့ ဦးနှောက်ထဲမှာ Joy, Sadness, Anger, Fear, Disgust တို့ ဘယ်လိုအလုပ်လုပ်ကြတယ်ဆိုတာ Pixar က ဖန်တီးပြထားပါတယ်။ ကလေးတွေအတွက်ရော အရွယ်ရောက်သူတွေအတွက်ပါ ခံစားစရာကောင်းပါတယ်။" },
  US048: { year: 2009, min: 96, cat: CAT_ANIME, review: "Ellie နဲ့ Carl တို့ရဲ့ အချစ်ဇာတ်လမ်းကို ပထမ ၁၀ မိနစ်အတွင်း စကားမပြောပဲ ဖော်ပြနိုင်တဲ့ Pixar ရဲ့ အနုပညာဆန်ဆုံး လက်ရာတွေထဲပါ။ Adventure နဲ့ မိတ်ဆွေချစ်ကြည်မှုကို လှပစွာ ဖော်ပြထားပါတယ်။" },
  US049: { year: 2008, min: 98, cat: CAT_ANIME, review: "Earth ကို စွန့်ပစ်ပြီးနောက် WALL-E ဆိုတဲ့ robot ကလေးရဲ့ တစ်ကိုယ်တော်ဘဝနဲ့ EVE နဲ့ ချစ်ခင်မှုဇာတ်လမ်း။ Dialogue အလွန်နည်းပေမယ့် ခံစားချက်ပြည့်ဝတဲ့ အန်နီမေးရှင်းကောင်းပါတယ်။" },
  US050: { year: 1995, min: 81, cat: CAT_ANIME, review: "Toy တွေက လူတွေမမြင်တဲ့အခါ အသက်ရှင်နေတယ်ဆိုတဲ့ စိတ်ကူးကနေ Pixar ရဲ့ ပထမဆုံး ဇာတ်လမ်းတွဲဖြစ်လာပါတယ်। Woody နဲ့ Buzz တို့ရဲ့ မိတ်ဆွေဖြစ်လာမှုဟာ မိသားစုတိုင်းရဲ့ အကြိုက်တွေ့ပါလိမ့်မယ်။" },
  US051: { year: 2001, min: 125, cat: CAT_ANIME, review: "Studio Ghibli ရဲ့ အကျော်ကြားဆုံး လက်ရာ။ Chihiro ရဲ့ spirit ကမ္ဘာထဲ ဝင်ရောက်ပြီး ရင့်ကျက်လာတဲ့ဇာတ်လမ်းဟာ Miyazaki ရဲ့ စိတ်ကူးယဉ်အနုပညာရဲ့ အထွတ်အထိပ်ဖြစ်ပါတယ်။" },
  US052: { year: 1997, min: 134, cat: CAT_ANIME, review: "သဘာဝနဲ့ လူသားတို့ရဲ့ ပဋိပက္ခကို Miyazaki က ဘက်လိုက်မှုမရှိပဲ ဖော်ပြထားတဲ့ epic အန်နီမေးရှင်း။ San နဲ့ Ashitaka တို့ရဲ့ ဇာတ်လမ်းဟာ အရွယ်မရွေး ခံစားစရာကောင်းပါတယ်။" },
  US053: { year: 2016, min: 106, cat: CAT_ANIME, review: "အချိန်နဲ့အာကာသကွာခြားနေတဲ့ Taki နဲ့ Mitsuha တို့ရဲ့ အချစ်ဇာတ်လမ်းကို Shinkai Makoto က လှပတဲ့ ရုပ်မြင်သံကြားနည်းပညာနဲ့ ရိုက်ကူးထားပါတယ်။ Japan မှာ box office record တွေစွာ ချိုးခဲ့ပါတယ်။" },
  US054: { year: 1988, min: 124, cat: CAT_ANIME, review: "Neo-Tokyo မှာ psychic စွမ်းအားတွေ ပေါ်ပေါက်လာတဲ့ Kaneda နဲ့ Tetsuo တို့ရဲ့ဇာတ်လမ်း။ Cyberpunk anime အမျိုးအစားရဲ့ အုတ်မြစ်ဖြစ်တဲ့အတွက် anime ချစ်သူတိုင်း ကြည့်သင့်ပါတယ်။" },
  US055: { year: 1960, min: 109, cat: CAT_HORROR, review: "Hitchcock ရဲ့ Psycho ဟာ horror/thriller အမျိုးအစားရဲ့ အခြေခံအုတ်မြစ်ဖြစ်ပါတယ်။ Bates Motel ရဲ့ ရှောဝါခန်းတိုက်ပွဲဟာ ရုပ်ရှင်သမိုင်းမှာ အကြောက်ဆုံး ဖော်ပြချက်တွေထဲပါပါတယ်။" },
  US056: { year: 1979, min: 117, cat: CAT_HORROR, review: "Nostromo အာကာသယာဉ်ပေါ်မှာ Alien တစ်ကောင် ဝင်ရောက်တိုက်ခိုက်တဲ့ဇာတ်လမ်း။ Sigourney Weaver ရဲ့ Ripley ဟာ ရုပ်ရှင်သမိုင်းရဲ့ အကောင်းဆုံး heroine တွေထဲပါပါတယ်။ \"In space no one can hear you scream\" လို့ ပြောထားတာလိုပါပဲ။" },
  US057: { year: 1980, min: 146, cat: CAT_HORROR, review: "Kubrick ရဲ့ Overlook Hotel ဟာ အိမ်ထောင်ရေးပြိုကျမှုနဲ့ စိတ်ရောဂါကို အလွန်အမင်း ဖော်ပြထားတဲ့ horror masterpiece ပါ။ Jack Nicholson ရဲ့ \"Here's Johnny!\" ဟာ မမေ့နိုင်တဲ့ စာကြေးတိုဖြစ်ပါတယ်။" },
  US058: { year: 1985, min: 116, cat: CAT_SCIFI, review: "DeLorean ကားနဲ့ အချိန်ခရီးသွားတဲ့ Marty McFly ရဲ့ စွန့်ခြောက်မှုဇာတ်လမ်း။ ၁၉၈၅ ရဲ့ ဒီဇာတ်ကားဟာ ယနေ့တိုင် ကလေးတွေအကြိုက်တွေ့နေဆဲဖြစ်ပြီး family entertainment ရဲ့ စံနမူနာပါ။" },
  US059: { year: 1981, min: 115, cat: CAT_ACTION, review: "Indiana Jones ရဲ့ ပထမဆုံး စွန့်ခြောက်မှုဇာတ်လမ်း။ Spielberg နဲ့ Lucas တို့ရဲ့ ပူးတွဲလက်ရာဟာ adventure ဇာတ်ကားတွေရဲ့ စံနမူနာဖြစ်ပြီး ၄၀ နှစ်ကြာပေမယ့် ခံစားချက်တွေ မပြောင်းလဲသွားပါဘူး။" },
  US060: { year: 1942, min: 102, cat: CAT_DRAMA, review: "WWII Casablanca မြို့မှာ Rick နဲ့ Ilsa တို့ရဲ့ ပြန် meeting ဖြစ်မှုဇာတ်လမ်း။ \"Here's looking at you, kid\" ဆိုတဲ့ စာကြေးတိုကလေးဟာ ရုပ်ရှင်သမိုင်းမှာ အကောင်းဆုံး romantic line တွေထဲပါပါတယ်။" },
};

const SERIES = {
  "Andor": { year: 2022, min: 45, cat: CAT_TV, q: "Andor", review: "Star Wars ကမ္ဘာထဲက အကောင်းဆုံး series တွေထဲပါဝင်ပြီး အာဏာရှင်စနစ်ကို တော်လှန်တဲ့ Cassian Andor ရဲ့ မွေးဖွားလမ်းကို ဖော်ပြထားပါတယ်။ စာရိတ်နဲ့ နိုင်ငံရေးဇာတ်လမ်းကို အနက်ရှိုင်းဆုံး ဖော်ပြနိုင်တဲ့ series ကောင်းပါ။" },
  "Arcane": { year: 2021, min: 42, cat: CAT_TV, q: "Arcane", review: "League of Legends game ကို အခြေခံထားပေမယ့် game မကစားဖူးသူတွေအတွက်ရေး စိတ်ဝင်စားစရာကောင်းပါတယ်။ Vi နဲ့ Jinx မောင်နှမတို့ရဲ့ ဇာတ်လမ်းနဲ့ animation အရည်အသွေးက အံ့အားသင့်စရာကောင်းပါတယ်။" },
  "Attack on Titan": { year: 2013, min: 24, cat: CAT_ANIME, review: "Titan တွေရဲ့ တိုက်ခိုက်မှုကနေ လူသားတွေ ရှင်သန်ရေးအတွက် ရုန်းကန်ရတဲ့ ဇာတ်လမ်း။ Eren Yeager ရဲ့ လက်စားချေရေးနဲ့ လူ့သဘာဝအကြောင်း မေးခွန်းထုတ်မှုတွေက anime သမိုင်းရဲ့ အကောင်းဆုံးလက်ရာတွေထဲပါ။" },
  "Avatar - The Last Airbender": { year: 2005, min: 23, cat: CAT_ANIME, q: "Avatar: The Last Airbender", review: "Aang ဆိုတဲ့ Airbender နောက်ဆုံးဆက်ခံသူရဲ့ ကမ္ဘာကြီးကို ငြိမ်းချမ်းအောင်လုပ်တဲ့ခရီး။ ကလေး series လိုမြင်ရပေမယ့် ဇာတ်အိမ်တွေဟာ အရွယ်မရွေး စိတ်ဝင်စားစရာကောင်းပြီး ယနေ့တိုင် ချစ်ကြတဲ့ classic ပါ။" },
  "Band of Brothers": { year: 2001, min: 60, cat: CAT_TV, q: "Band of Brothers", review: "WWII Easy Company တပ်ဖွဲ့ရဲ့ စစ်မှုဇာတ်လမ်းကို Tom Hanks နဲ့ Spielberg တို့က ထုတ်လုပ်ထားပါတယ်။ စစ်ဘဝရဲ့ ကြမ်းတမ်းမှုနဲ့ မိတ်ဆွေချစ်ကြည်မှုကို လက်တွေ့ဆန်ဆန် ဖော်ပြထားတဲ့ HBO ရဲ့ အကောင်းဆုံး series တွေထဲပါ။" },
  "Beef": { year: 2023, min: 35, cat: CAT_TV, q: "Beef", review: "Parking lot မှာ road rage ဖြစ်ပွားပြီးနောက် Danny နဲ့ Amy တို့ရဲ့ ဘဝတွေ ရှုပ်ပျက်သွားတဲ့ A24 ရဲ့ dark comedy။ လူ့စိတ်ခံစားချက်နဲ့ အာရှအမေရိကန်ဘဝကို ထူးခြားတဲ့ပုံစံနဲ့ ဖော်ပြထားပါတယ်။" },
  "Better Call Saul": { year: 2015, min: 47, cat: CAT_TV, q: "Better Call Saul", review: "Breaking Bad ရဲ့ spin-off ဖြစ်ပေမယ့် မူရင်း series လောက်ပင် အံ့အားသင့်စရာကောင်းပါတယ်။ Jimmy McGill က Saul Goodman ဖြစ်လာတဲ့လမ်းကို Bob Odenkirk က အလွန်ခံစားစရာကောင်းအောင် သရုပ်ဆောင်ထားပါတယ်။" },
  "Black Mirror": { year: 2011, min: 60, cat: CAT_TV, q: "Black Mirror", review: "နည်းပညာရဲ့ အနှစ်မဲ့ဘက်ကို anthology ပုံစံနဲ့ ဖော်ပြထားတဲ့ Charlie Brooker ရဲ့ series။ တစ်ပိုင်းချင်းစီ ဇာတ်လမ်းသီးခြားဖြစ်ပြီး နည်းပညာအကြောင်း တွေးခိုက်တွေးခိုက မျက်စိပြေးစေပါတယ်။" },
  "BoJack Horseman": { year: 2014, min: 25, cat: CAT_TV, q: "BoJack Horseman", review: "Alcohol စွဲလမ်းနေတဲ့ horse actor BoJack ရဲ့ depression နဲ့ ကိုယ့်ကိုယ်ကိုယ်ရှာဖွေမှုဇာတ်လမ်း။ Cartoon ပုံစံလိုမြင်ရပေမယ့် mental health အကြောင်းကို အရမ်းအနက်ရှိုင်းဆုံး ဖော်ပြထားတဲ့ adult animation ပါ။" },
  "Breaking Bad": { year: 2008, min: 47, cat: CAT_TV, q: "Breaking Bad", review: "Cancer ဖြစ်နေတဲ့ chemistry ဆရာ Walter White က drug lord ဖြစ်လာတဲ့ဇာတ်လမ်း။ Bryan Cranston ရဲ့ သရုပ်ဆောင်မှုနဲ့ Vince Gilligan ရဲ့ ဇာတ်လမ်းရေးသားမှုဟာ TV သမိုင်းရဲ့ အကြီးကျယ်ဆုံးလက်ရာတွေထဲပါပါတယ်။" },
  "Brooklyn Nine-Nine": { year: 2013, min: 22, cat: CAT_TV, q: "Brooklyn Nine-Nine", review: "Brooklyn ရဲ့ ၉၉ ဌာနခွဲရဲ့ ရူးသွပ်နေတဲ့ရဲများရဲ့ နေ့ရေးနေ့ထဲ့ဇာတ်လမ်း။ Andy Samberg ရဲ့ Jake Peralta က ရယ်စရာကောင်းပြီး ဇာတ်ကောင်တွေကလည်း ချစ်စရာကောင်းတဲ့အတွက် ပင်ပန်းနေတဲ့အခါ ကြည့်ကောင်းတဲ့ sitcom ပါ။" },
  "Chernobyl": { year: 2019, min: 60, cat: CAT_TV, q: "Chernobyl", review: "၁၉၈၆ Chernobyl နျူကလီးယား ဘေးအန္တရာယ်ရဲ့ ဇာတ်ကြောင်းကို ၅ ပိုင်းတွဲနဲ့ ဖော်ပြထားပါတယ်။ လူ့အမှားရဲ့ ကြမ်းတမ်းမှုနဲ့ မှန်ကန်မှုအတွက် ရုန်းကန်ရတာကို HBO က အလွန်ခမ်းနားစွာ ရိုက်ကူးထားပါတယ်။" },
  "Community": { year: 2009, min: 22, cat: CAT_TV, q: "Community", review: "Greendale Community College မှာ မတူညီတဲ့ လူငယ်တွေရဲ့ မိတ်ဆွေဖြစ်လာမှုဇာတ်လမ်း။ Meta humor နဲ့ pop culture reference တွေကြောင့် cult following ရခဲ့ပြီး Donald Glover နဲ့ Joel McHale တို့ရဲ့ chemistry က အလွန်ကောင်းပါတယ်။" },
  "Dark": { year: 2017, min: 55, cat: CAT_TV, q: "Dark", review: "Winden မြို့လေးမှာ ကလေးတွေပျောက်ဆုံးပြီးနောက် time travel လျှို့ဝှက်ချက်တွေ ပေါ်လာတဲ့ German series။ အချိန်ဇယားတွေ ထပ်နေတာက ကြည့်ရင်း ဦးနှောက်ကို လှုပ်ရှားစေပြီး Netflix ရဲ့ အကောင်းဆုံး non-English series တွေထဲပါ။" },
  "Death Note": { year: 2006, min: 23, cat: CAT_ANIME, review: "Death Note ဆိုတဲ့ notebook ကို ရှာတွေ့ပြီး Light Yagami က ကမ္ဘာကြီးကို ပြောင်းလဲဖို့ ကြိုးစားတဲ့ဇာတ်လမ်း။ L နဲ့ Light တို့ရဲ့ ဉာဏ်ရည်ပြိုင်ပွဲဟာ anime သမိုင်းမှာ အကောင်းဆုံး တင်းမာတဲ့ ဇာတ်လမ်းတွေထဲပါပါတယ်။" },
  "Dexter": { year: 2006, min: 55, cat: CAT_TV, q: "Dexter", review: "Miami ရဲ့ forensic blood analyst Dexter Morgan ဟာ ညဘက်မှာ serial killer ပါ။ Villain ကို hero လို ခံစားစေတဲ့ ထူးခြားတဲ့ဇာတ်လမ်းဖွဲ့စည်းမှုကြောင့် Michael C. Hall ရဲ့ သရုပ်ဆောင်မှုက အလွန်ခံစားစရာကောင်းပါတယ်။" },
  "Fargo": { year: 2014, min: 53, cat: CAT_TV, q: "Fargo", review: "Coen brothers ရဲ့ Fargo ဇာတ်ကားကို anthology series အဖြစ် ပြန်လည်ဖန်တီးထားပါတယ်။ Minnesota ရဲ့ နှင်းခဲလေထုထဲက ရာဇဝတ်မှုဇာတ်လမ်းတွေကို dark comedy နဲ့ ရောစပ်ထားတာက ထူးခြားပြီး တစ် season ချင်းစီမှာ ကွဲပြားတဲ့ ဇာတ်ကောင်တွေ ရှိပါတယ်။" },
  "Fleabag": { year: 2016, min: 27, cat: CAT_TV, q: "Fleabag", review: "London မှာ café လေးလည်ပတ်နေရင်း ဘဝကို ရှုပ်ပွနေတဲ့ အမျိုးသမီးတစ်ဦးရဲ့ ဇာတ်လမ်းကို Phoebe Waller-Bridge က ရေးသားပြီး သရုပ်ဆောင်ထားပါတယ်။ Camera ကို ကြည့်ပြီး ပြောတဲ့ စတိုင်က ထူးခြားပြီး ရယ်စရာရော ခံစားစရာရော ဖြစ်စေပါတယ်။" },
  "Friends": { year: 1994, min: 22, cat: CAT_TV, q: "Friends", review: "NYC မှာ ၂၀ အရွယ် မိတ်ဆွေ ၆ ယောက်ရဲ့ ဘဝဇာတ်လမ်း။ Ross, Rachel, Monica, Chandler, Joey, Phoebe တို့ရဲ့ မိတ်ဆွေချစ်ကြည်မှုဟာ မျိုးဆက်ပြီးမျိုးဆက် ပရိသတ်တွေရဲ့ နှလုံးသားထဲ ရောက်နေဆဲပါ။ ပင်ပန်းနေတဲ့နေ့တိုင်း ကြည့်ကောင်းတဲ့ comfort show ပါ။" },
  "Fullmetal Alchemist - Brotherhood": { year: 2009, min: 24, cat: CAT_ANIME, q: "Fullmetal Alchemist: Brotherhood", review: "Edward နဲ့ Alphonse Elric မောင်နှမတို့ရဲ့ Philosopher's Stone ရှာဖွေမှုဇာတ်လမ်း။ ဇာတ်အိမ်က ကျယ်ပြန့်ပြီး ဇာတ်ကောင်တိုင်းမှာ နက်နဲတဲ့ ခံစားချက်ရှိတဲ့အတွက် anime သမိုင်းရဲ့ အကောင်းဆုံး series တွေထဲ အမြဲပါဝင်ပါတယ်။" },
  "Game of Thrones": { year: 2011, min: 57, cat: CAT_TV, q: "Game of Thrones", review: "Westeros ကမ္ဘာမှာ Iron Throne အတွက် မိသားစုတွေရဲ့ အာဏာတိုက်ပွဲ။ နိုင်ငံရေး၊ စစ်မှု၊ ဒဏ္ဍာရီတွေကို ရောစပ်ထားတဲ့ epic series ကြီးဖြစ်ပြီး နောက်ဆုံး seasons တွေမှာ အငြင်းပွားခဲ့ပေမယ့် TV သမိုင်းရဲ့ အကြီးမားဆုံး cultural phenomenon တွေထဲပါ။" },
  "House of the Dragon": { year: 2022, min: 60, cat: CAT_TV, q: "House of the Dragon", review: "Game of Thrones ရဲ့ ၂၀၀ နှစ်အရင် Targaryen မိသားစုရဲ့ အာဏာပဋိပက္ခဇာတ်လမ်း။ Daemon နဲ့ Rhaenyra တို့ရဲ့ဇာတ်လမ်းက စိတ်ဝင်စားစရာကောင်းပြီး GoT fan တွေအတွက် ပြန်လည်ရှာတွေ့ရတဲ့ခံစားချက် ပေးပါတယ်။" },
  "How I Met Your Mother": { year: 2005, min: 22, cat: CAT_TV, q: "How I Met Your Mother", review: "Ted က သူ့ကလေးတွေကို သူ့ဇနီးဘယ်လိုတွေ့ခဲ့လဲဆိုတာ ပြန်ပြောပြတဲ့ပုံစံနဲ့ ဖော်ပြထားတဲ့ sitcom။ Barney Stinson က ရယ်စရာကောင်းပြီး အချစ်ရေးနဲ့ မိတ်ဆွေချစ်ကြည်မှုဇာတ်လမ်းက Friends fan တွေအတွက် ကောင်းမွန်တဲ့ ရွေးချယ်မှုပါ။" },
  "Lost": { year: 2004, min: 43, cat: CAT_TV, q: "Lost", review: "Oceanic 815 လေယာဉ်ပျက်ကျပြီးနောက် ကျွန်းတစ်ကျွန်းပေါ်မှာ ရှင်သန်ကျန်ရစ်သူတွေရဲ့ လျှို့ဝှက်ချက်ဇာတ်လမ်း။ ၂၀၀၀ ခုနှစ်တွေရဲ့ အကြီးမားဆုံး mystery series ဖြစ်ပြီး ဇာတ်လမ်းတွေကို အကြိမ်ကြိမ် ခန့်မှန်းခိုက်တွေးစေပါတယ်။" },
  "Mad Men": { year: 2007, min: 47, cat: CAT_TV, q: "Mad Men", review: "၁၉၆၀ Don Draper နဲ့ Madison Avenue advertising လောကရဲ့ဇာတ်လမ်း။ ခေတ်ပြိုင်အဝတ်အစား၊ လူမှုရေးပြဿနာတွေကို AMC က အလွန်တိကျစွာ ဖန်တီးထားပြီး Jon Hamm ရဲ့သရုပ်ဆောင်မှုက အနုပညာအဆင့်မီပါတယ်။" },
  "Mare of Easttown": { year: 2021, min: 58, cat: CAT_TV, q: "Mare of Easttown", review: "Pennsylvania မြို့လေးမှာ လူသတ်မှုဖြေရှင်းရတဲ့ detective Mare Sheehan ရဲ့ဇာတ်လမ်း။ Kate Winslet ရဲ့ Oscar အဆင့်မီ သရုပ်ဆောင်မှုနဲ့ မြို့လေးရဲ့ ပင်ပန်းဘဝခံစားချက်ကို HBO က လက်တွေ့ဆန်ဆန် ဖော်ပြထားပါတယ်။" },
  "Mindhunter": { year: 2017, min: 55, cat: CAT_TV, q: "Mindhunter", review: "FBI agents တွေက serial killer တွေကို အင်တာဗျူးလုပ်ပြီး criminal psychology ကို လေ့လာတဲ့ David Fincher ရဲ့ Netflix series။ တင်းမာတဲ့လေထုနဲ့ လက်တွေ့ဆန်တဲ့ ဇာတ်လမ်းဖော်ပြချက်ကြောင့် thriller fan တွေ အကြိုက်တွေ့ပါလိမ့်မယ်။" },
  "Modern Family": { year: 2009, min: 21, cat: CAT_TV, q: "Modern Family", review: "ခေတ်ဆန်တဲ့ မိသားစု ၃ စုရဲ့ နေ့ရေးနေးထဲ့ဇာတ်လမ်းကို mockumentary ပုံစံနဲ့ ဖော်ပြထားပါတယ်။ Phil Dunphy က ရယ်စရာအကောင်းဆုံး TV dad တွေထဲပါပါတယ်။ မိသားစုချစ်ကြည်မှုကို ရယ်ရင်း ခံစားစေတဲ့ sitcom ကောင်းပါ။" },
  "Money Heist": { year: 2017, min: 50, cat: CAT_TV, q: "Money Heist", review: "Professor ရဲ့ စီစဉ်မှုအောက်မှာ Royal Mint of Spain ကို လုယက်တဲ့ Spanish series။ \"Bella Ciao\" သီချင်းနဲ့အတူ တိုက်ပွဲဝင်ကြတဲ့ Tokyo နဲ့ အဖွဲ့ဝင်တွေရဲ့ ဇာတ်လမ်းက ကမ္ဘာတစ်ဝန်း ပရိသတ်တွေရဲ့ ချစ်မြတ်နိုးမှု ရခဲ့ပါတယ်။" },
  "Narcos": { year: 2015, min: 50, cat: CAT_TV, q: "Narcos", review: "Colombia မှာ Pablo Escobar ရဲ့ drug empire တက်လမ်းနဲ့ DEA agents တွေရဲ့ တိုက်ပွဲဇာတ်လမ်း။ Wagner Moura ရဲ့ Escobar သရုပ်ဆောင်မှုဟာ လက်တွေ့ဆန်ပြီး crime drama fan တွေအတွက် မကြည့်ဘဲမနေနိုင်တဲ့ series ပါ။" },
  "One Punch Man": { year: 2015, min: 24, cat: CAT_ANIME, review: "Saitama ဟာ တစ်ချက်ခုတ်ဖို့ပဲ လိုတဲ့ superhero ဖြစ်နေပြီး စိန်ခေါ်မှုကို ရှာနေတဲ့ဇာတ်လမ်း။ Action scene တွေက အလွန်လှပပြီး ရယ်စရာရော ခံစားစရာရော ဖြစ်စေတဲ့ superhero parody anime ပါ။" },
  "Ozark": { year: 2017, min: 55, cat: CAT_TV, q: "Ozark", review: "Chicago financial advisor Wendy နဲ့ Marty Byrde တို့က drug cartel အတွက် Missouri Ozarks မှာ ငွေကြေးလိမ်လည်မှုလုပ်ရတဲ့ဇာတ်လမ်း။ Jason Bateman ရဲ့ တင်းမာတဲ့ သရုပ်ဆောင်မှုက Breaking Bad fan တွေကို ကြိုက်စေပါလိမ့်မယ်။" },
  "Parks and Recreation": { year: 2009, min: 22, cat: CAT_TV, q: "Parks and Recreation", review: "Indiana Pawnee မြို့ရဲ့ Parks department မှာ Leslie Knope ရဲ့ အစိုးရအလုပ်ဇာတ်လမ်း။ Ron Swanson နဲ့ Aziz Ansari ရဲ့ Tom Haverford တို့က ရယ်စရာကောင်းပြီး အားလပ်ရက်မှာ ကြည့်ရတာ ပျော်စရာကောင်းတဲ့ comedy ပါ။" },
  "Peaky Blinders": { year: 2013, min: 58, cat: CAT_TV, q: "Peaky Blinders", review: "WWII အပြီး Birmingham မှာ Shelby family ရဲ့ gangster empire တက်လမ်းဇာတ်လမ်း။ Cillian Murphy ရဲ့ Thomas Shelby သရုပ်ဆောင်မှုက အလွန်ခံစားစရာကောင်းပြီး Nick Cave ရဲ့ \"Red Right Hand\" theme song က ဇာတ်ကားရဲ့ လေထုကို တစ်ဆစ်ချိုး တိုးစေပါတယ်။" },
  "Prison Break": { year: 2005, min: 44, cat: CAT_TV, q: "Prison Break", review: "အစ်ကို Lincoln ကို ထောင်မှ ကယ်ထုတ်ဖို့ Michael Scofield က မင်းရဲ့ ခန္ဓာကိုယ်ပေါ်မှာ ထောင်ရဲ့ blueprint တattoo ထိုးထားတဲ့ဇာတ်လမ်း။ Season 1 ဟာ အလွန်တင်းမာပြီး Wentworth Miller ရဲ့ ဉာဏ်ကြီးသရုပ်ဆောင်မှုက စိတ်ဝင်စားစရာကောင်းပါတယ်။" },
  "Rick and Morty": { year: 2013, min: 22, cat: CAT_TV, q: "Rick and Morty", review: "မူးယစ်ဆေးဝါးသုံးတဲ့ သိပ္ပံပညာရှင် Rick နဲ့ သူ့မြေး Morty တို့ရဲ့ multiverse adventure ဇာတ်လမ်း။ Sci-fi concept တွေကို ရယ်စရာနဲ့ အနက်ရှိုင်းဆုံး ခံစားချက်တွေနဲ့ ရောစပ်ထားတဲ့ adult animation ရဲ့ အကောင်းဆုံးလက်ရာတွေထဲပါ။" },
  "Seinfeld": { year: 1989, min: 22, cat: CAT_TV, q: "Seinfeld", review: "NYC မှာ comedian Jerry Seinfeld နဲ့ သူ့မိတ်ဆွေတွေရဲ့ \"nothing\" အကြောင်းဇာတ်လမ်း။ \"Show about nothing\" ဆိုတဲ့ ဒီconcept က ၁၉၉၀ sitcom တွေရဲ့ စံနမူနာဖြစ်စေခဲ့ပြီး ယနေ့တိုင် ရယ်စရာကောင်းပါတယ်။" },
  "Severance": { year: 2022, min: 48, cat: CAT_TV, q: "Severance", review: "Lumon Industries မှာ အလုပ်လုပ်တဲ့သူတွေက အလုပ်မှာရော အိမ်မှာပါ မှတ်ဥပမာ ခွဲထုတ်ခံရတဲ့ sci-fi thriller။ Adam Scott ရဲ့သရုပ်ဆောင်မှုနဲ့ Ben Stiller ရဲ့ ရိုက်ကူးမှုက အံ့ဩစရာကောင်းပြီး Apple TV+ ရဲ့ အကောင်းဆုံး series တွေထဲပါ။" },
  "Sherlock": { year: 2010, min: 88, cat: CAT_TV, q: "Sherlock", review: "Arthur Conan Doyle ရဲ့ Sherlock Holmes ဇာတ်လမ်းကို ခေတ်မီ London မှာ Benedict Cumberbatch နဲ့ Martin Freeman တို့က ပြန်လည်ဖော်ပြထားပါတယ်။ Mind palace ခန်းတွေနဲ့ dialogue တွေက အလွန်ခမ်းနားပြီး BBC ရဲ့ အကောင်းဆုံး series တွေထဲပါ။" },
  "Shogun": { year: 2024, min: 60, cat: CAT_TV, q: "Shogun", review: "၁၆၀၀ ပြည့်နှစ် Japan မှာ English sailor John Blackthorne နဲ့ Lord Toranaga တို့ရဲ့ အာဏာတိုက်ပွဲဇာတ်လမ်း။ Hiroyuki Sanada ရဲ့သရုပ်ဆောင်မှုနဲ့ သမိုင်းမှန်ဖော်ပြချက်တွေကြောင့် Emmy တွေစွာ ရခဲ့ပါတယ်။" },
  "Squid Game": { year: 2021, min: 55, cat: CAT_TV, q: "Squid Game", review: "ကြွေးမြီပိန်နေတဲ့ ၄၅၆ ယောက်က သေနာက်စားကစားပွဲထဲ ပါဝင်ရတဲ့ Korean series။ လူမှုရေးတန်းမှားယွင်းချက်ကို ကြမ်းတမ်းတဲ့ပုံစံနဲ့ ဖော်ပြထားပြီး Netflix ရဲ့ အကြီးမားဆုံး hit တွေထဲပါဝင်ပါတယ်။" },
  "Stranger Things": { year: 2016, min: 51, cat: CAT_TV, q: "Stranger Things", review: "Hawkins မြို့လေးမှာ Will Byers ပျောက်ဆုံးပြီးနောက် Upside Down လျှို့ဝှက်ကမ္ဘာကို ကလေးတွေရှာဖွေတဲ့ ၈၀s sci-fi horror series။ မိတ်ဆွေချစ်ကြည်မှု၊ မိသားစု၊ ၈၀s nostalgia တွေကို ရောစပ်ထားတဲ့ Netflix ရဲ့ flagship series ပါ။" },
  "Succession": { year: 2018, min: 60, cat: CAT_TV, q: "Succession", review: "Media tycoon Logan Roy ရဲ့ media empire အတွက် ကလေးတွေရဲ့ အာဏာတိုက်ပွဲဇာတ်လမ်း။ Dark comedy နဲ့ family drama ကို ရောစပ်ထားတဲ့ HBO ရဲ့ အကောင်းဆုံး series တွေထဲပါပါတယ်။ စာကြေးတိုတွေက အလွန်ထက်မြက်ပါတယ်။" },
  "Supernatural": { year: 2005, min: 44, cat: CAT_TV, q: "Supernatural", review: "Dean နဲ့ Sam Winchester မောင်နှမတို့က demon, ghost, monster တွေကို လိုက်လံတိုက်ခိုက်တဲ့ ၁၅ season ကြာ long-running series။ မောင်နှမချစ်ကြည်မှုနဲ့ 80s rock soundtrack တွေကြောင့် ပရိသတ်တွေရဲ့ ချစ်မြတ်နိုးမှုရခဲ့ပါတယ်။" },
  "Ted Lasso": { year: 2020, min: 30, cat: CAT_TV, q: "Ted Lasso", review: "American football coach Ted Lasso က English Premier League club တစ်ခုကို စီမံရတဲ့ feel-good comedy။ လူ့သဘာဝရဲ့ အလင်းရောင်ဘက်ကို အလေးပေးထားတဲ့အတွက် ပင်ပန်းနေတဲ့နေ့တွေမှာ ကြည့်ရတာ နွေးထွေးစေတဲ့ series ပါ။" },
  "The Bear": { year: 2022, min: 30, cat: CAT_TV, q: "The Bear", review: "Fine dining chef Carmy က သူ့အစ်ကိုရဲ့ sandwich shop ကို ဆက်ခံရတဲ့ Chicago kitchen ဇာတ်လမ်း။ Kitchen ရဲ့ တင်းမာတဲ့လေထုနဲ့ Jeremy Allen White ရဲ့သရုပ်ဆောင်မှုကြောင့် Emmy တွေစွာ ရခဲ့ပါတယ်။" },
  "The Big Bang Theory": { year: 2007, min: 21, cat: CAT_TV, q: "The Big Bang Theory", review: "Physicists Sheldon နဲ့ Leonard နဲ့ သူတို့ရဲ့ nerd မိတ်ဆွေအုပ်စုရဲ့ ဘဝဇာတ်လမ်း။ Sheldon Cooper ဟာ TV သမိုင်းရဲ့ အရယ်စရာအကောင်းဆုံး ဇာတ်ကောင်တွေထဲပါပါတယ်။ Science နဲ့ pop culture တွေကို ရောစပ်ထားတဲ့ sitcom ကောင်းပါ။" },
  "The Boys": { year: 2019, min: 60, cat: CAT_TV, q: "The Boys", review: "Superhero တွေက corporate ကုမ္ပဏီတွေရဲ့ product ဖြစ်နေပြီး လူမကောင်းတွေဖြစ်နေတဲ့ Amazon series။ Homelander က TV သမိုင်းရဲ့ အကြောက်ဆုံး villain တွေထဲပါပါတယ်။ Superhero genre ကို လုံးဝပြောင်းလဲပစ်တဲ့ satirical series ပါ။" },
  "The Crown": { year: 2016, min: 58, cat: CAT_TV, q: "The Crown", review: "Queen Elizabeth II ရဲ့ နန်းတက်မှုကနေ ဆယ်စုနှစ်တွေကြာ နန်းတော်ဘဝဇာတ်လမ်း။ British royal family ရဲ့ သမိုင်းကို ခမ်းနားတဲ့ production design နဲ့ ဖော်ပြထားပြီး Netflix ရဲ့ prestige drama ရဲ့ စံနမူနာပါ။" },
  "The Last of Us": { year: 2023, min: 55, cat: CAT_TV, q: "The Last of Us", review: "Fungal pandemic ပြီးနောက် Joel နဲ့ Ellie တို့ရဲ့ America တစ်လျှောက်ခရီးစဉ်ဇာတ်လမ်း။ Game ကို အခြေခံထားပေမယ့် ဇာတ်လမ်းအနက်ရှိုင်းဆုံး ခံစားချက်တွေကို Pedro Pascal နဲ့ Bella Ramsey တို့က အလွန်ခံစားစရာကောင်းအောင် သရုပ်ဆောင်ထားပါတယ်။" },
  "The Mandalorian": { year: 2019, min: 40, cat: CAT_TV, q: "The Mandalorian", review: "Bounty hunter Din Djarin နဲ့ Grogu (Baby Yoda) တို့ရဲ့ galaxy ခရီးစဉ်။ Baby Yoda က ချစ်စရာကောင်းပြီး Star Wars universe ကို western ပုံစံနဲ့ ပြန်လည်ဖန်တီးထားတဲ့ Disney+ ရဲ့ အောင်မြင်မှုရှိတဲ့ series ပါ။" },
  "The Office (US)": { year: 2005, min: 22, cat: CAT_TV, q: "The Office", review: "Scranton ရဲ့ Dunder Mifflin paper company မှာ office worker တွေရဲ့ နေ့ရေးနေးထဲ့ကို mockumentary ပုံစံနဲ့ ဖော်ပြထားပါတယ်။ Michael Scott, Jim, Pam, Dwight တို့ဟာ TV သမိုင်းရဲ့ အချစ်ဆုံး ဇာတ်ကောင်တွေထဲပါပါတယ်။" },
  "The Queen's Gambit": { year: 2020, min: 55, cat: CAT_TV, q: "The Queen's Gambit", review: "Chess prodigy Beth Harmon ရဲ့ အောင်မြင်မှုနဲ့ addiction တိုက်ပွဲဇာတ်လမ်း။ Anya Taylor-Joy ရဲ့သရုပ်ဆောင်မှုနဲ့ chess ခန်းတွေကို လှပစွာ ရိုက်ကူးထားတဲ့ Netflix mini-series က ကမ္ဘာတစ်ဝန်း chess ကို ထင်ပေါ်စေခဲ့ပါတယ်။" },
  "The Sopranos": { year: 1999, min: 55, cat: CAT_TV, q: "The Sopranos", review: "New Jersey mob boss Tony Soprano က depression အတွက် therapy တက်ရတဲ့ HBO series။ Golden Age of Television ရဲ့ အစပြုပေးတဲ့ series ဖြစ်ပြီး James Gandolfini ရဲ့သရုပ်ဆောင်မှုဟာ အနုပညာအဆင့်မီပါတယ်။" },
  "The White Lotus": { year: 2021, min: 55, cat: CAT_TV, q: "The White Lotus", review: "Luxury resort တွေမှာ ဧည့်သည်တွေနဲ့ staff တွေရဲ့ ရှုပ်ပွမှုဇာတ်လမ်းကို anthology ပုံစံနဲ့ ဖော်ပြထားပါတယ်။ Social satire နဲ့ mystery ကို Mike White က ထူးခြားတဲ့ပုံစံနဲ့ ရေးသားထားတဲ့ HBO series ကောင်းပါ။" },
  "The Wire": { year: 2002, min: 59, cat: CAT_TV, q: "The Wire", review: "Baltimore မြို့ရဲ့ drug trade, police, school, politics, media စတဲ့ အဖွဲ့အစည်းတွေကို season ၅ ချင်းစီမှာ အနက်ရှိုင်းဆုံး ဖော်ပြထားတဲ့ HBO series။ ရုပ်ရှင်ပညာရှင်တွေက အမြဲ အကောင်းဆုံး series စာရင်းမှာ ထည့်သွင်းကြတဲ့ masterpiece ပါ။" },
  "True Detective": { year: 2014, min: 55, cat: CAT_TV, q: "True Detective", review: "Louisiana မှာ ritual murder ဖြေရှင်းရတဲ့ detectives Rust Cohle နဲ့ Marty Hart တို့ရဲ့ ၁၇ နှစ်တာဇာတ်လမ်း။ Matthew McConaughey နဲ့ Woody Harrelson တို့ရဲ့ chemistry က အလွန်ကောင်းပြီး Season 1 ဟာ anthology crime drama ရဲ့ စံနမူနာပါ။" },
  "Watchmen": { year: 2019, min: 60, cat: CAT_TV, q: "Watchmen", review: "Alan Moore ရဲ့ graphic novel ကို ခေတ်မီ Tulsa မှာ ပြန်လည်ဖန်တီးထားတဲ့ HBO series။ Superhero deconstruction နဲ့ racial injustice အကြောင်းကို Regina King ရဲ့ သရုပ်ဆောင်မှုနဲ့ အလွန်ခံစားစရာကောင်းအောင် ဖော်ပြထားပါတယ်။" },
  "Westworld": { year: 2016, min: 60, cat: CAT_TV, q: "Westworld", review: "Robot hosts တွေနေတဲ့ amusement park မှာ consciousness ပေါ်ပေါက်လာတဲ့ Dolores ရဲ့ဇာတ်လမ်း။ AI, free will, memory အကြောင်း မေးခွန်းတွေကို HBO က ခမ်းနားတဲ့ production နဲ့ ဖော်ပြထားတဲ့ sci-fi series ပါ။" },
  "When They See Us": { year: 2019, min: 55, cat: CAT_TV, q: "When They See Us", review: "Central Park Five လို့လူသိများတဲ့ အသက်ငယ်ရွယ်သူ ၅ ယောက်ရဲ့ မှားယွင်းစွာအပြစ်ပေးခံရမှုဇာတ်လမ်းကို Ava DuVernay က ဖော်ပြထားပါတယ်။ လူမှုရေးတရားမျှတမှုအကြောင်း တွေးခိုက်တွေးခိုက မျက်ရည်တွေ ကျစေတဲ့ Netflix mini-series ပါ။" },
};

// ─────────────────────────────────────────────────────────────────
// Poster fetching helpers
// ─────────────────────────────────────────────────────────────────

async function fetchWithRetry(url) {
  const body = await curlText(url);
  if (!body) throw new Error("empty response");
  return body;
}

/** TMDB public site search → first result poster path (keyless). */
async function tmdbPoster(query) {
  const html = await fetchWithRetry(
    `https://www.themoviedb.org/search?query=${encodeURIComponent(query)}`
  );
  const m = html.match(/\/t\/p\/w94_and_h141_face\/([A-Za-z0-9]+)\.jpg/);
  return m ? `https://image.tmdb.org/t/p/w342/${m[1]}.jpg` : null;
}

/** TVMaze API → show image + runtime (free, keyless). */
async function tvmazeShow(query) {
  const body = await fetchWithRetry(
    `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`
  );
  const results = JSON.parse(body);
  if (!results.length) return null;
  const show = results[0].show;
  return {
    image: show.image?.original || show.image?.medium || null,
    runtimeMin: show.averageRuntime || show.runtime || null,
  };
}

function slugify(text, prefix = "") {
  const slug = text
    .normalize("NFKD")
    .replace(/[''’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return prefix ? `${prefix}-${slug}` : slug;
}

async function downloadPoster(url, destFile) {
  await curlToFile(url, destFile);
  const size = statSync(destFile).size;
  if (size < 3000) throw new Error(`poster too small (${size} bytes)`);
  return size;
}

/** Simple gradient placeholder SVG when no poster could be found. */
function placeholderSvg(title) {
  const esc = title.replace(/[<>&"]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="342" height="513">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="#312e81"/><stop offset="100%" stop-color="#18181b"/></linearGradient></defs>
<rect width="342" height="513" fill="url(#g)"/>
<text x="171" y="240" font-family="sans-serif" font-size="26" fill="#a5b4fc" text-anchor="middle">🎬</text>
<text x="171" y="290" font-family="sans-serif" font-size="19" font-weight="bold" fill="#e4e4e7" text-anchor="middle">${esc}</text>
</svg>`;
}

// ─────────────────────────────────────────────────────────────────
// Disk scanning
// ─────────────────────────────────────────────────────────────────

function listMovies() {
  const dir = join(MEDIA_ROOT, "movies");
  const out = [];
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    if (!statSync(full).isFile()) continue;
    if (![".mp4", ".mkv", ".avi", ".mov"].includes(extname(f).toLowerCase())) continue;
    const code = (f.match(/^(U[A-Z]\d{3})\s+(.*)\.(\w+)$/) || [])[1];
    const title = (f.match(/^(?:[A-Z]{2}\d{3})\s+(.*)\.(\w+)$/) || [])[1];
    if (!code || !title) {
      console.warn(`⚠ Skipping unparseable movie file: ${f}`);
      continue;
    }
    out.push({ code, title, path: full, sizeBytes: statSync(full).size });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

function parseEpisodeNumber(name) {
  const m = name.match(/^ep\s*(\d{1,4})\.\w+$/i);
  return m ? parseInt(m[1], 10) : null;
}

function listSeriesEpisodes(folderName) {
  const base = join(MEDIA_ROOT, "series", folderName);
  const episodes = [];

  // Flat layout: epN.mp4 directly inside the folder → Season 1
  let flatFound = false;
  for (const f of readdirSync(base)) {
    const full = join(base, f);
    if (!statSync(full).isFile()) continue;
    const ep = parseEpisodeNumber(f);
    if (ep !== null) {
      flatFound = true;
      episodes.push({ season: 1, episode: ep, path: full, sizeBytes: statSync(full).size });
    }
  }

  // Seasoned layout: "Season N/epN.mp4"
  for (const d of readdirSync(base)) {
    const sub = join(base, d);
    if (!statSync(sub).isDirectory()) continue;
    const sm = d.match(/season\s*(\d+)/i);
    const season = sm ? parseInt(sm[1], 10) : null;
    if (season === null) continue;
    for (const f of readdirSync(sub)) {
      const full = join(sub, f);
      if (!statSync(full).isFile()) continue;
      const ep = parseEpisodeNumber(f);
      if (ep !== null) {
        episodes.push({ season, episode: ep, path: full, sizeBytes: statSync(full).size });
      }
    }
  }

  if (!episodes.length) console.warn(`⚠ No episodes found for series: ${folderName}`);
  episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
  return { flatFound, episodes };
}

// ─────────────────────────────────────────────────────────────────
// Main build
// ─────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(POSTER_DIR, { recursive: true });

  const movies = listMovies();
  const seriesNames = readdirSync(join(MEDIA_ROOT, "series")).filter((d) =>
    statSync(join(MEDIA_ROOT, "series", d)).isDirectory()
  );
  console.log(`Found ${movies.length} movies and ${seriesNames.length} series on disk.`);

  const categories = [
    ...EXTRA_CATEGORIES.map((c) => ({ ...c, seeded_elsewhere: true })),
  ].map(({ seeded_elsewhere, ...rest }) => rest);

  const videos = [];
  let postersOk = 0, postersFail = 0;

  // ── Movies ──
  for (const mv of movies) {
    const meta = MOVIES[mv.code];
    if (!meta) {
      console.warn(`⚠ No metadata for movie ${mv.code} (${mv.title}); using defaults.`);
    }
    const year = meta?.year ?? null;
    const catId = meta?.cat ?? CAT_ACTION;
    const review = meta?.review ?? "";
    const durationSec = Math.round((meta?.min ?? 110) * 60);

    const slug = slugify(mv.title, mv.code.toLowerCase());
    const thumbPath = `/posters/${slug}.jpg`;
    const posterFile = join(POSTER_DIR, `${slug}.jpg`);

    if (!SKIP_POSTERS && !existsSync(posterFile)) {
      try {
        const url = await tmdbPoster(meta?.q || mv.title);
        if (url) {
          await downloadPoster(url, posterFile);
          postersOk++;
        } else {
          throw new Error("no TMDB result");
        }
        await new Promise((r) => setTimeout(r, 700)); // be polite to TMDB
      } catch (err) {
        console.warn(`✖ Poster failed for "${mv.title}" (${err.message}) — writing placeholder.`);
        writeFileSync(posterFile.replace(/\.jpg$/, ".svg"), placeholderSvg(mv.title));
        postersFail++;
      }
    }

    videos.push({
      category_id: catId,
      content_type: "movie",
      title: mv.title,
      description: review,
      duration_seconds: durationSec,
      release_year: year,
      price_ks: MOVIE_PRICE,
      episode_number: null,
      episode_count: null,
      season_number: null,
      series_title: null,
      video_path: mv.path,
      hard_disk_label: DISK_LABEL,
      trailer_path: null,
      thumbnail_path: existsSync(posterFile) ? thumbPath : thumbPath.replace(/\.jpg$/, ".svg"),
      file_size_bytes: mv.sizeBytes,
      mime_type: "video/mp4",
    });
  }

  // ── Series ──
  for (const folderName of seriesNames) {
    const meta = SERIES[folderName];
    if (!meta) {
      console.warn(`⚠ No metadata for series "${folderName}"; using defaults.`);
    }
    const displayTitle = meta?.q || folderName;
    const year = meta?.year ?? null;
    const catId = meta?.cat ?? CAT_TV;
    const review = meta?.review ?? "";
    const defaultEpMin = meta?.min ?? 45;

    const { episodes } = listSeriesEpisodes(folderName);
    if (!episodes.length) continue;

    const slug = slugify(folderName, "tv");
    const thumbPath = `/posters/${slug}.jpg`;
    const posterFile = join(POSTER_DIR, `${slug}.jpg`);

    let runtimeMin = defaultEpMin;
    if (!SKIP_POSTERS && !existsSync(posterFile)) {
      try {
        const info = await tvmazeShow(meta?.q || folderName);
        if (info?.runtimeMin) runtimeMin = info.runtimeMin;
        if (!info?.image) throw new Error("no TVMaze result/image");
        await downloadPoster(info.image, posterFile);
        postersOk++;
        await new Promise((r) => setTimeout(r, 400)); // be polite to TVMaze
      } catch (err) {
        console.warn(`✖ Poster failed for "${folderName}" (${err.message}) — writing placeholder.`);
        writeFileSync(posterFile.replace(/\.jpg$/, ".svg"), placeholderSvg(displayTitle));
        postersFail++;
      }
    }

    const totalEps = episodes.length;
    for (const ep of episodes) {
      videos.push({
        category_id: catId,
        content_type: "series",
        title: displayTitle,
        description: review,
        duration_seconds: Math.round(runtimeMin * 60),
        release_year: year,
        price_ks: SERIES_EP_PRICE,
        episode_number: ep.episode,
        episode_count: totalEps,
        season_number: ep.season,
        series_title: displayTitle,
        video_path: ep.path,
        hard_disk_label: DISK_LABEL,
        trailer_path: null,
        thumbnail_path: existsSync(posterFile) ? thumbPath : thumbPath.replace(/\.jpg$/, ".svg"),
        file_size_bytes: ep.sizeBytes,
        mime_type: "video/mp4",
      });
    }
  }

  const seed = {
    generated_at: new Date().toISOString(),
    media_root: MEDIA_ROOT,
    disk_label: DISK_LABEL,
    extra_categories: EXTRA_CATEGORIES,
    videos,
  };

  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 1));
  console.log(
    `\n✔ Seed written: ${SEED_PATH}\n` +
      `  movies: ${movies.length} | series titles: ${Object.keys(SERIES).length}\n` +
      `  total video rows: ${videos.length}\n` +
      `  posters ok: ${postersOk}, fallback placeholders: ${postersFail}`
  );
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
