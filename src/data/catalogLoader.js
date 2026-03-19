import { fetchXmlDocument } from "./xmlLoader.js";
import {
  parseBrickCategoriesDocument,
  parseJukeboxDocument,
  parseObstacleTypesDocument,
  parsePowerUpsDocument,
  parseSoundsDocument,
  validateCatalog
} from "./manifestParsers.js";

export async function loadCatalog() {
  const [soundsDoc, jukeboxDoc, categoriesDoc, obstacleTypesDoc, powerUpsDoc] = await Promise.all([
    fetchXmlDocument("data/Sounds.xml"),
    fetchXmlDocument("data/Jukebox.xml"),
    fetchXmlDocument("data/BrickCategories.xml"),
    fetchXmlDocument("data/ObstacleTypes.xml"),
    fetchXmlDocument("data/PowerUps.xml")
  ]);

  const sounds = parseSoundsDocument(soundsDoc);
  const jukebox = parseJukeboxDocument(jukeboxDoc);
  const categories = parseBrickCategoriesDocument(categoriesDoc);
  const obstacleTypes = parseObstacleTypesDocument(obstacleTypesDoc);
  const powerUps = parsePowerUpsDocument(powerUpsDoc);

  const catalog = {
    ...sounds,
    ...jukebox,
    ...categories,
    ...obstacleTypes,
    ...powerUps
  };

  validateCatalog(catalog);
  return catalog;
}
