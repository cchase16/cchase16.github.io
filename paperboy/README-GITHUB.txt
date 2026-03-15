Paperboy Neighborhood Prototype - GitHub Pages Package

What to upload to GitHub Pages:
- Upload the files in this folder root directly to your GitHub Pages repository root.
- The game is already built and should work on GitHub Pages because asset paths are relative.

You do NOT need to build anything in VS Code just to test this package on GitHub Pages.

If you want to edit the source code later:
- Open the source-project folder in VS Code
- Run: npm install
- Run: npm run dev   (local testing)
- Run: npm run build (creates an updated dist folder)
- Then upload the newly built dist folder contents to GitHub Pages

Important:
- If your GitHub Pages site serves from the repository root, upload these root files as-is.
- If you use the docs/ publishing option instead, copy the contents of dist into docs after building.
