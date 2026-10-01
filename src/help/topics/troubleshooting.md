---
title: Troubleshooting
order: 17
keywords: problem, help, not loading, missing, export different, storage, browser, lost, error, damaged, corrupt, newer version, full, private, recovered, crash
---
## My diagram isn't there

Diagrams are stored **per browser**. A different browser, device, private window or web address starts empty.

- Open your latest **Save as JSON** file with **Open JSON**.
- If shapes seem to be missing, check [Layers](help:layers) for hidden layers.
- If a banner says autosave failed, browser storage is full or blocked. Choose **Export JSON now**.

## A file won't open

Opening a file never changes your current diagram unless it opens. Each message says what's wrong; **Details** shows the technical reason.

- **That file is empty** or **can't open this type of file**: choose a `.json` file you saved with **Save as JSON**.
- **That file is damaged**: the file is cut short or broken. Try an earlier copy.
- **That isn't a Chalkline diagram**: valid JSON, but not a diagram. Backups go through **Import backup** in Settings, and stencil files through **My stencils** in the palette.
- **That diagram has problems**: something inside doesn't add up, for example a connector to a missing shape. Usually caused by editing the file by hand.
- **Made by a newer version of Chalkline**: reload the page to get the latest Chalkline, then open it again.

## A message when Chalkline starts

- **Your autosaved diagram couldn't be read**: Chalkline starts with an empty diagram and keeps a copy of the damaged data. Choose **Export recovered data** to save it as a file.
- **Your saved diagram is from a newer version**: you used a newer Chalkline in this browser. Autosave pauses so that diagram isn't overwritten. Reload the page to get the latest version.

## Autosave failed

- **Storage is full**: your latest changes aren't saved in this browser. Choose **Export JSON now**, then free some space (for example **Clear local data** in Settings, after exporting a backup).
- **Storage is blocked**: private windows and some site-data settings don't let Chalkline save. Export JSON before you close the tab.

## Chalkline couldn't show this diagram

Something in the diagram stopped the canvas from drawing. Choose **Export JSON** to keep it, then **Start a new diagram** (undo brings the old one back), or **Try again**.

## An export looks different

- Exports use the current theme. Switch between light and dark before exporting to choose.
- Hidden layers are left out unless you turn on **Include hidden layers**.
- Some apps show SVG files with a different font. Use PNG or PDF when the exact look matters.

## Storage is per browser

Autosave, your stencil library and settings stay in this browser only. Nothing is sent anywhere. Use **Export everything** in [Settings](help:settings-and-backup) to back up all of it in one file.
