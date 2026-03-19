# Musical Brick Buster XML Spec v1

This document defines the exact v1 XML formats for shipped manifests, level files, and settings import/export.

## General Rules

- All XML files must use UTF-8 encoding.
- All root nodes must include `version="1.0"`.
- All ids are case-sensitive strings and must be unique within their file.
- Cross-file references are always made by id.
- Unknown elements and attributes should be ignored by the loader to allow forward compatibility.
- Relative file locations are resolved from the site root.

## Coordinate System

- Level placement uses grid coordinates, not pixels.
- Grid origin is the top-left corner.
- `col` increases to the right.
- `row` increases downward.
- Brick placements occupy exactly `1x1` grid cell.
- Obstacle placements occupy the size defined by their obstacle type.
- In v1, shipped obstacle types use `2x2` grid cells.

## 1. Sounds.xml

File name: `data/Sounds.xml`

Root:

```xml
<Sounds version="1.0">
  ...
</Sounds>
```

Child element:

```xml
<Sound id="string">
  <Name>string</Name>
  <Family>string</Family>
  <Location>string</Location>
</Sound>
```

Required rules:

- `id` is required and unique.
- `Name` is required.
- `Family` is required.
- `Location` is required.
- In v1 sample content, all sound effects use `SoundEffects/BellSplash.mp3`.

## 2. Jukebox.xml

File name: `data/Jukebox.xml`

Root:

```xml
<Jukebox version="1.0">
  ...
</Jukebox>
```

Child element:

```xml
<Track id="string">
  <Name>string</Name>
  <Description>string</Description>
  <Location>string</Location>
</Track>
```

Required rules:

- `id` is required and unique.
- `Name` is required.
- `Description` is required.
- `Location` is required.
- In v1 sample content, all jukebox tracks use `JukeboxAudio/Strollin.mp3`.

## 3. BrickCategories.xml

File name: `data/BrickCategories.xml`

Root:

```xml
<BrickCategories version="1.0">
  ...
</BrickCategories>
```

Child element:

```xml
<BrickCategory id="string">
  <Name>string</Name>
  <Color>#RRGGBB</Color>
  <HitsToBreak>1|2|3</HitsToBreak>
  <DefaultSoundId>string</DefaultSoundId>
</BrickCategory>
```

Required rules:

- `id` is required and unique.
- `Name` is required.
- `Color` is required and must be a 7-character hex color in `#RRGGBB` form.
- `HitsToBreak` is required and must be `1`, `2`, or `3`.
- `DefaultSoundId` is required and must match a `Sound/@id` in `Sounds.xml`.

Behavior rules:

- Levels reference brick categories by `id`.
- The runtime gets a brick's color and durability from its category.
- The runtime uses the user's sound override for that category when present; otherwise it uses `DefaultSoundId`.

## 4. ObstacleTypes.xml

File name: `data/ObstacleTypes.xml`

Root:

```xml
<ObstacleTypes version="1.0">
  ...
</ObstacleTypes>
```

Child element:

```xml
<ObstacleType id="string">
  <Name>string</Name>
  <WidthUnits>integer</WidthUnits>
  <HeightUnits>integer</HeightUnits>
  <Color>#RRGGBB</Color>
  <Behavior>reflect</Behavior>
  <Indestructible>true|false</Indestructible>
</ObstacleType>
```

Required rules:

- `id` is required and unique.
- `Name` is required.
- `WidthUnits` is required and must be an integer greater than or equal to `1`.
- `HeightUnits` is required and must be an integer greater than or equal to `1`.
- `Color` is required and must be a 7-character hex color in `#RRGGBB` form.
- `Behavior` is required. In v1 the only allowed value is `reflect`.
- `Indestructible` is required and must be `true` or `false`.

Recommended v1 content rule:

- Shipped v1 obstacle types should use `WidthUnits=2` and `HeightUnits=2`.

## 5. Level XML

File name in repo examples: `data/levels/level-001.xml`

User-imported and user-exported files may use any file name, but the XML root and structure must match this spec.

Root:

```xml
<Level version="1.0" id="string">
  <Metadata>
    <Name>string</Name>
    <Author>string</Author>
    <Source>authored|generated|imported</Source>
    <GridColumns>integer</GridColumns>
    <GridRows>integer</GridRows>
    <Seed>string</Seed>
  </Metadata>
  <Layout>
    <Brick categoryId="string" col="integer" row="integer" />
    <Obstacle typeId="string" col="integer" row="integer" />
  </Layout>
</Level>
```

Required rules:

- `Level/@id` is required.
- `Metadata/Name` is required.
- `Metadata/Author` is required.
- `Metadata/Source` is required and must be `authored`, `generated`, or `imported`.
- `Metadata/GridColumns` is required and must be an integer greater than or equal to `1`.
- `Metadata/GridRows` is required and must be an integer greater than or equal to `1`.
- `Metadata/Seed` is optional and is primarily used for generated levels.
- Every `Brick` requires `categoryId`, `col`, and `row`.
- Every `Obstacle` requires `typeId`, `col`, and `row`.

Validation rules:

- `Brick/@categoryId` must match a `BrickCategory/@id`.
- `Obstacle/@typeId` must match an `ObstacleType/@id`.
- `col` and `row` must be integers greater than or equal to `0`.
- A brick must fit entirely inside the declared grid.
- An obstacle must fit entirely inside the declared grid after applying its width and height.
- Bricks may not overlap other bricks.
- Obstacles may not overlap other obstacles.
- Bricks and obstacles may not overlap each other.

Runtime rules:

- Bricks store only placement and category reference.
- Obstacles store only placement and type reference.
- Procedurally generated levels must normalize to the same runtime shape as imported levels.

## 6. Settings XML

Suggested file name for import/export: `settings.xml`

Repo example file: `user/examples/settings-example.xml`

Root:

```xml
<GameSettings version="1.0">
  <Gameplay>
    <BallSpeed>decimal</BallSpeed>
    <ThemeId>string</ThemeId>
    <SelectedTrackId>string</SelectedTrackId>
    <LauncherSoundId>string</LauncherSoundId>
  </Gameplay>
  <CategorySoundAssignments>
    <Assignment categoryId="string" soundId="string" />
  </CategorySoundAssignments>
</GameSettings>
```

Required rules:

- `Gameplay/BallSpeed` is required and must be a decimal greater than `0`.
- `Gameplay/ThemeId` is required.
- `Gameplay/SelectedTrackId` is required and must match a `Track/@id` in `Jukebox.xml`.
- `Gameplay/LauncherSoundId` is optional and must match a `Sound/@id` in `Sounds.xml` when present.
- `Assignment/@categoryId` is required and must match a `BrickCategory/@id`.
- `Assignment/@soundId` is required and must match a `Sound/@id` in `Sounds.xml`.

Recommended gameplay rule:

- Treat `BallSpeed` as a multiplier where `1.0` is the default.

Import behavior:

- If a referenced track, sound, or category id is unknown, ignore that setting and fall back to the app default.

## Sample Files Included

- `data/Sounds.xml`
- `data/Jukebox.xml`
- `data/BrickCategories.xml`
- `data/ObstacleTypes.xml`
- `data/levels/level-001.xml`
- `user/examples/generated-level-example.xml`
- `user/examples/settings-example.xml`
