import { fetchYearAndGenre } from "./libs/metaFetch.js";

const result = await fetchYearAndGenre("Hellhills", "Getting Bored");
console.log(result);