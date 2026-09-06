import { ensureEmailIndex } from "../services/search";

ensureEmailIndex()
  .then(() => {
    console.log("Elasticsearch index ready");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
