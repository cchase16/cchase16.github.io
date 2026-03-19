function requiredRoot(documentNode, tagName) {
  const element = documentNode.documentElement;
  if (!element || element.tagName !== tagName) {
    throw new Error(`Expected root <${tagName}>`);
  }
  return element;
}

function requiredAttribute(element, name) {
  const value = element.getAttribute(name);
  if (value == null || value === "") {
    throw new Error(`Missing attribute "${name}" on <${element.tagName}>`);
  }
  return value;
}

function requiredText(parent, tagName) {
  const element = parent.querySelector(tagName);
  const value = element?.textContent?.trim();
  if (!value) {
    throw new Error(`Missing <${tagName}> inside <${parent.tagName}>`);
  }
  return value;
}

function optionalText(parent, tagName) {
  const element = parent.querySelector(tagName);
  return element?.textContent?.trim() || "";
}

function positiveInteger(value, context) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${context} must be an integer >= 1`);
  }
  return parsed;
}

function nonNegativeInteger(value, context) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${context} must be an integer >= 0`);
  }
  return parsed;
}

function decimal(value, context) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${context} must be a number > 0`);
  }
  return parsed;
}

function hexColor(value, context) {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`${context} must be in #RRGGBB format`);
  }
  return value.toUpperCase();
}

function uniqueIdMap(items, itemName) {
  const byId = new Map();
  for (const item of items) {
    if (byId.has(item.id)) {
      throw new Error(`Duplicate ${itemName} id "${item.id}"`);
    }
    byId.set(item.id, item);
  }
  return byId;
}

export function parseSoundsDocument(documentNode) {
  const root = requiredRoot(documentNode, "Sounds");
  const sounds = [...root.querySelectorAll("Sound")].map((soundElement) => ({
    id: requiredAttribute(soundElement, "id"),
    name: requiredText(soundElement, "Name"),
    family: requiredText(soundElement, "Family"),
    location: requiredText(soundElement, "Location")
  }));

  return {
    sounds,
    soundById: uniqueIdMap(sounds, "sound")
  };
}

export function parseJukeboxDocument(documentNode) {
  const root = requiredRoot(documentNode, "Jukebox");
  const tracks = [...root.querySelectorAll("Track")].map((trackElement) => ({
    id: requiredAttribute(trackElement, "id"),
    name: requiredText(trackElement, "Name"),
    description: requiredText(trackElement, "Description"),
    location: requiredText(trackElement, "Location")
  }));

  return {
    tracks,
    trackById: uniqueIdMap(tracks, "track")
  };
}

export function parseBrickCategoriesDocument(documentNode) {
  const root = requiredRoot(documentNode, "BrickCategories");
  const categories = [...root.querySelectorAll("BrickCategory")].map((categoryElement) => {
    const hitsToBreak = positiveInteger(requiredText(categoryElement, "HitsToBreak"), "HitsToBreak");
    if (hitsToBreak > 3) {
      throw new Error("HitsToBreak must be 1, 2, or 3");
    }

    return {
      id: requiredAttribute(categoryElement, "id"),
      name: requiredText(categoryElement, "Name"),
      color: hexColor(requiredText(categoryElement, "Color"), "Color"),
      hitsToBreak,
      defaultSoundId: requiredText(categoryElement, "DefaultSoundId")
    };
  });

  return {
    categories,
    categoryById: uniqueIdMap(categories, "brick category")
  };
}

export function parseObstacleTypesDocument(documentNode) {
  const root = requiredRoot(documentNode, "ObstacleTypes");
  const obstacleTypes = [...root.querySelectorAll("ObstacleType")].map((typeElement) => {
    const behavior = requiredText(typeElement, "Behavior");
    if (behavior !== "reflect") {
      throw new Error(`Unsupported obstacle behavior "${behavior}"`);
    }

    const indestructibleValue = requiredText(typeElement, "Indestructible");

    return {
      id: requiredAttribute(typeElement, "id"),
      name: requiredText(typeElement, "Name"),
      widthUnits: positiveInteger(requiredText(typeElement, "WidthUnits"), "WidthUnits"),
      heightUnits: positiveInteger(requiredText(typeElement, "HeightUnits"), "HeightUnits"),
      color: hexColor(requiredText(typeElement, "Color"), "Color"),
      behavior,
      indestructible: indestructibleValue === "true"
    };
  });

  return {
    obstacleTypes,
    obstacleTypeById: uniqueIdMap(obstacleTypes, "obstacle type")
  };
}

export function parseLevelDocument(documentNode) {
  const root = requiredRoot(documentNode, "Level");
  const metadataNode = root.querySelector("Metadata");
  const layoutNode = root.querySelector("Layout");

  if (!metadataNode || !layoutNode) {
    throw new Error("Level must include Metadata and Layout");
  }

  const source = requiredText(metadataNode, "Source");
  if (!["authored", "generated", "imported"].includes(source)) {
    throw new Error(`Unsupported level source "${source}"`);
  }

  return {
    id: requiredAttribute(root, "id"),
    metadata: {
      name: requiredText(metadataNode, "Name"),
      author: requiredText(metadataNode, "Author"),
      source,
      gridColumns: positiveInteger(requiredText(metadataNode, "GridColumns"), "GridColumns"),
      gridRows: positiveInteger(requiredText(metadataNode, "GridRows"), "GridRows"),
      seed: optionalText(metadataNode, "Seed")
    },
    bricks: [...layoutNode.querySelectorAll("Brick")].map((brickElement, index) => ({
      id: `brick-${index + 1}`,
      categoryId: requiredAttribute(brickElement, "categoryId"),
      col: nonNegativeInteger(requiredAttribute(brickElement, "col"), "Brick col"),
      row: nonNegativeInteger(requiredAttribute(brickElement, "row"), "Brick row")
    })),
    obstacles: [...layoutNode.querySelectorAll("Obstacle")].map((obstacleElement, index) => ({
      id: `obstacle-${index + 1}`,
      typeId: requiredAttribute(obstacleElement, "typeId"),
      col: nonNegativeInteger(requiredAttribute(obstacleElement, "col"), "Obstacle col"),
      row: nonNegativeInteger(requiredAttribute(obstacleElement, "row"), "Obstacle row")
    }))
  };
}

export function parseSettingsDocument(documentNode) {
  const root = requiredRoot(documentNode, "GameSettings");
  const gameplayNode = root.querySelector("Gameplay");
  const assignmentsNode = root.querySelector("CategorySoundAssignments");

  if (!gameplayNode || !assignmentsNode) {
    throw new Error("GameSettings must include Gameplay and CategorySoundAssignments");
  }

  const categorySoundAssignments = {};
  for (const assignmentElement of assignmentsNode.querySelectorAll("Assignment")) {
    categorySoundAssignments[requiredAttribute(assignmentElement, "categoryId")] = requiredAttribute(
      assignmentElement,
      "soundId"
    );
  }

  return {
    ballSpeed: decimal(requiredText(gameplayNode, "BallSpeed"), "BallSpeed"),
    themeId: requiredText(gameplayNode, "ThemeId"),
    selectedTrackId: requiredText(gameplayNode, "SelectedTrackId"),
    launcherSoundId: optionalText(gameplayNode, "LauncherSoundId"),
    categorySoundAssignments
  };
}

export function validateCatalog(catalog) {
  for (const category of catalog.categories) {
    if (!catalog.soundById.has(category.defaultSoundId)) {
      throw new Error(`Brick category "${category.id}" references unknown sound "${category.defaultSoundId}"`);
    }
  }
}

export function validateLevel(level, catalog) {
  const occupied = new Set();

  for (const brick of level.bricks) {
    if (!catalog.categoryById.has(brick.categoryId)) {
      throw new Error(`Level references unknown brick category "${brick.categoryId}"`);
    }
    if (brick.col >= level.metadata.gridColumns || brick.row >= level.metadata.gridRows) {
      throw new Error(`Brick at (${brick.col}, ${brick.row}) is outside the level grid`);
    }

    const key = `${brick.col},${brick.row}`;
    if (occupied.has(key)) {
      throw new Error(`Overlapping placement at (${brick.col}, ${brick.row})`);
    }
    occupied.add(key);
  }

  for (const obstacle of level.obstacles) {
    const type = catalog.obstacleTypeById.get(obstacle.typeId);
    if (!type) {
      throw new Error(`Level references unknown obstacle type "${obstacle.typeId}"`);
    }
    if (
      obstacle.col + type.widthUnits > level.metadata.gridColumns ||
      obstacle.row + type.heightUnits > level.metadata.gridRows
    ) {
      throw new Error(`Obstacle "${obstacle.typeId}" at (${obstacle.col}, ${obstacle.row}) is outside the level grid`);
    }

    for (let rowOffset = 0; rowOffset < type.heightUnits; rowOffset += 1) {
      for (let colOffset = 0; colOffset < type.widthUnits; colOffset += 1) {
        const key = `${obstacle.col + colOffset},${obstacle.row + rowOffset}`;
        if (occupied.has(key)) {
          throw new Error(`Obstacle overlap at (${obstacle.col}, ${obstacle.row})`);
        }
        occupied.add(key);
      }
    }
  }

  return true;
}

export function sanitizeImportedSettings(settings, catalog, validThemeIds) {
  const sanitizedAssignments = {};
  for (const [categoryId, soundId] of Object.entries(settings.categorySoundAssignments || {})) {
    if (catalog.categoryById.has(categoryId) && catalog.soundById.has(soundId)) {
      sanitizedAssignments[categoryId] = soundId;
    }
  }

  return {
    ballSpeed: Number.isFinite(settings.ballSpeed) && settings.ballSpeed > 0 ? settings.ballSpeed : 1,
    themeId: validThemeIds.has(settings.themeId) ? settings.themeId : [...validThemeIds][0],
    selectedTrackId: catalog.trackById.has(settings.selectedTrackId)
      ? settings.selectedTrackId
      : catalog.tracks[0]?.id || "",
    launcherSoundId: catalog.soundById.has(settings.launcherSoundId)
      ? settings.launcherSoundId
      : catalog.sounds[0]?.id || "",
    categorySoundAssignments: sanitizedAssignments
  };
}
