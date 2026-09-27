# Research: Windows package steps for this engine (issue #62)

- step: 1 Research, node #62 (children: #64 Package a Windows build pointed at the host, #65 Test a second PC joining with a code)
- date: 2026-09-27
- agent: Claude

## What I read

`docs/BUILD_BIBLE.md` section 2 (Download), `docs/FRAMEWORK.md`, `docs/research/online-table.md`.
Epic's UE5 docs pages on packaging, the Platforms menu, build operations, and Visual Studio setup (list at the bottom).
The Epic docs host was blocked from this sandbox, so the menu text below comes from search excerpts of those
pages plus known UE5 behavior. It was not clicked through in an editor.

The engine version is not known yet. #32 (read `EngineAssociation` from the art pack's `.uproject`) is paused
until the gaming PC is free. So this note covers UE 5.3 to 5.6+, and says where versions differ.

## What is true

### The clicks (UE 5.0 and later)

1. Open the project in the Unreal Editor on the gaming PC.
2. Set the maps first. **Edit > Project Settings > Project > Maps & Modes**: set the Game Default Map to the start
   menu map. Then **Project Settings > Project > Packaging > List of maps to include in a packaged build**: add
   only the Emberisle maps. If this list is empty, the cook takes every map in the project, including every demo
   map in the 3.6 GB art pack.
3. In the main toolbar, click **Platforms** (the icon with a grid, next to Play).
4. Hover **Windows**.
5. Under **Binary Configuration**, pick **Shipping**. The default reads "Use Project Setting (Development)".
   The value in brackets is what Project Settings holds. Picking it here changes it for this package.
6. In the same submenu, open **Packaging Settings** (or **Project Settings > Project > Packaging**) and check:
   - **Build Configuration**: Shipping (same setting as step 5).
   - **Full Rebuild**: on for the build we send.
   - **For Distribution**: on. It marks the build as a release build. On Windows it changes little; it matters
     most for console and mobile signing.
   - **Use Pak File**: on (default). **Use Io Store**: on (default in UE5).
   - **Include Prerequisites installer**: on. This puts the Visual C++ runtime installer in the package.
7. Back in **Platforms > Windows**, click **Package Project**.
8. Pick an empty output folder, for example `D:\Builds\Emberisle`. Unreal writes a `Windows` folder inside it.
9. Wait. The Output Log shows the steps (build, cook, stage, package, archive). It ends with
   `BUILD SUCCESSFUL`. A toast in the bottom right says "Packaging complete".

Shipping removes the console and the stat commands. Development keeps them. Use Development for the first
test on the gaming PC if something needs debugging, then Shipping for the zip.

### Where the clicks differ by version

| Version | Menu path | Build config lives in | Output folder name |
|---|---|---|---|
| UE 4.x | **File > Package Project > Windows > Windows (64-bit)** | **File > Package Project > Build Configuration** | `WindowsNoEditor` |
| UE 5.0 to 5.5 | **Platforms > Windows > Package Project** | **Platforms > Windows > Binary Configuration** | `Windows` |
| UE 5.6+ | Same as 5.5 | Same as 5.5 | `Windows` |

- **Project Launcher.** In 5.0 to 5.5 it is **Platforms > Project Launcher** (older layout, custom launch
  profiles). 5.6 added a new Project Launcher UI (beta). The old one is still there as **Legacy Project
  Launcher**. Forum reports say the new 5.6 UI had trouble producing a plain exe. We do not need it:
  **Package Project** or the command line below is enough.
- **Visual Studio.** UE 5.3 to 5.6 use Visual Studio 2022. A C++ project needs the **Game development with C++**
  workload, a Windows 10/11 SDK, and the MSVC toolset that Epic lists for that engine version. A Blueprint-only
  project from the Epic Games Launcher engine usually packages without Visual Studio, because the engine binaries
  are prebuilt. If any code plugin must be compiled, Unreal asks for Visual Studio anyway.
- **Prerequisites installer name.** UE4 shipped `UE4PrereqSetup_x64.exe`. UE5 ships `UEPrereqSetup_x64.exe`.
  Both install the Visual C++ runtime. In UE5 it is under `Engine\Extras\Redist\en-us\` in the package.

### What the output folder looks like (UE5, project named `Emberisle`)

```
D:\Builds\Emberisle\Windows\
  Emberisle.exe                      <- small launcher. Friends double-click this one.
  Manifest_*.txt                     <- list of staged files. Safe to leave out of the zip.
  Emberisle\
    Binaries\Win64\
      Emberisle-Win64-Shipping.exe   <- the real game. The launcher starts it.
    Content\Paks\
      Emberisle-Windows.pak / .utoc / .ucas
  Engine\
    Extras\Redist\en-us\UEPrereqSetup_x64.exe
    ...
```

- The exe name comes from the project name. If the art pack's project is not called `Emberisle`, the file is
  `<ProjectName>.exe`. Renaming the project is the clean fix. Renaming the top exe after packaging is not tested.
- The window title comes from **Project Settings > Project > Description > Project Displayed Title**. Set it to
  `Emberisle` (build bible, top).
- In Development the real exe is `Emberisle.exe` in `Binaries\Win64`. In Shipping it has the `-Win64-Shipping`
  suffix.

### Size of the cook

Only cooked assets go in the pak. The cook starts from the maps in the "maps to include" list and pulls in what
they reference. The rest of the art pack stays out. Things that pull in too much: an empty maps list (cooks all
maps), **Cook everything in the project content directory** turned on, and folders listed under
**Additional Asset Directories to Cook**. Check the pak size after the first package. If it is several GB, the
maps list is the first suspect.

### The same thing from the command line (repeatable)

`RunUAT.bat` is in the engine folder (`Engine\Build\BatchFiles`). This does the same as the clicks and can go in
a `.bat` file. The paths are examples.

```
"C:\Program Files\Epic Games\UE_5.X\Engine\Build\BatchFiles\RunUAT.bat" BuildCookRun ^
  -project="D:\Projects\Emberisle\Emberisle.uproject" ^
  -noP4 -platform=Win64 -clientconfig=Shipping ^
  -build -cook -stage -pak -prereqs -distribution ^
  -archive -archivedirectory="D:\Builds\Emberisle" ^
  -utf8output
```

- `-clientconfig=Shipping` is the Binary Configuration. Use `Development` for a debug build.
- `-cook -stage -pak` cook, copy into a staging folder, and pack into paks.
- `-archive -archivedirectory=...` copies the final build out. It lands in `<archivedirectory>\Windows\`.
- `-prereqs` includes the prerequisites installer. `-distribution` is the For Distribution box.
- Add `-map=Map1+Map2` to cook only those maps, if the Project Settings list is not set.
- Replace `UE_5.X` with the real folder once #32 gives the version.

### Reading `host.txt` beside the exe (for #64)

#64 says a `host.txt` next to the exe can override the server address. In a packaged build:

- `FPaths::RootDir()` is the `Windows\` folder, where the launcher `Emberisle.exe` sits. This is the folder a
  friend sees after unzipping. `FPaths::Combine(FPaths::RootDir(), TEXT("host.txt"))` is the path to read.
- `FPlatformProcess::BaseDir()` is `Emberisle\Binaries\Win64\`, where the real exe sits. That is not beside the
  exe the friend clicks.
- `FPaths::LaunchDir()` is the working directory the game was started from. A shortcut can change it. Do not
  rely on it.
- `FPaths::ProjectDir()` is `Windows\Emberisle\`.
- Read the file with `FFileHelper::LoadFileToString`, trim it, and ignore it if it is empty. From Blueprint, a
  small C++ function (or a file-reading plugin) is needed, because stock Blueprint cannot read an arbitrary text
  file.

**Conflict with the build bible.** Section 2.2 says to save the pasted URL in `Saved/Config/host.txt`. In a
packaged Windows build, `Saved` is normally under `%LOCALAPPDATA%\Emberisle\Saved\`, not beside the exe. So there
are two places. A reasonable order for #64 to decide: `host.txt` beside the exe, then the saved one from the gear
field, then the baked `ServerUrl`. That order is a Design call, not settled here.

### Zipping

1. Rename the output `Windows` folder to `Emberisle`, so the zip opens to a folder with a clear name.
2. Zip that folder into `Emberisle-Windows.zip` (build bible 2.1). Explorer's **Send to > Compressed (zipped)
   folder** works. 7-Zip is faster on large builds. Windows 10/11 also has `tar -a -c -f Emberisle-Windows.zip
   Emberisle`. Older Windows PowerShell `Compress-Archive` is known to fail on files over 2 GB.
3. Leave out `Manifest_*.txt` and any `Saved` folder if one appears. Do not put a `host.txt` with anything
   private in it. The server hostname is fine. Tunnel credentials never go in the zip, the repo, or this note.

### What friends see on first run (unsigned exe)

- The exe is not code-signed. Windows SmartScreen shows "Windows protected your PC". The friend clicks
  **More info**, then **Run anyway**. This happens once per new build.
- A zip from a browser download is marked as from the internet. Unzip it first. Running the exe from inside the
  zip preview fails or runs from a temp folder, and `host.txt` will not be found.
- If the game says a runtime DLL is missing (for example `VCRUNTIME140.dll`), run
  `Engine\Extras\Redist\en-us\UEPrereqSetup_x64.exe` from the unzipped folder.
- Some antivirus tools flag new unsigned exes. For a private friends build, the fix is to tell them in the Drive
  line. Code signing costs money and is out of scope for v1.
- Windows Firewall may ask about network access the first time. The game only makes outgoing connections to the
  host, so allowing it or not should not matter. #65 will confirm.

## What I am not sure about

- Exact menu wording in the engine version the art pack uses. The Epic docs site was blocked here, so the labels
  come from search excerpts of the UE5 docs. They match 5.x, but the labels should be checked on screen.
- Whether a Blueprint-only project from this art pack packages without Visual Studio. It depends on its plugins.
- Whether renaming the top-level launcher exe (if the project is not named Emberisle) still starts the game.
- The `%LOCALAPPDATA%` location of `Saved` in a packaged build is known behavior, but not checked on this build.

## Open questions (check on the gaming PC)

1. Engine version: `EngineAssociation` in the `.uproject` (this is #32).
2. Blueprint-only or C++: is there a `Source\` folder next to the `.uproject`? If yes, Visual Studio 2022 with the
   C++ game workload is needed before packaging.
3. Project name: the `.uproject` file name. It sets the exe name.

## Handoff

```
done: the clicks, the config (Shipping), the output folder, the command line, where host.txt is read, zip and first-run notes
left: #64 packages the build and decides the host.txt order; #65 tests a second PC
broke: nothing
next agent: #64, after #32 gives the engine version
```

## Sources

- Packaging Your Project (UE5): https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-your-project
- Using the Platforms Dropdown in Unreal Editor: https://dev.epicgames.com/documentation/en-us/unreal-engine/using-the-platforms-dropdown-in-unreal-editor
- Build Operations (BuildCookRun): https://dev.epicgames.com/documentation/unreal-engine/build-operations-cooking-packaging-deploying-and-running-projects-in-unreal-engine
- Packaging and Shipping in Unreal Engine: https://dev.epicgames.com/documentation/unreal-engine/packaging-and-shipping-in-unreal-engine
- Using the Project Launcher: https://dev.epicgames.com/documentation/unreal-engine/using-the-project-launcher-in-unreal-engine
- Setting Up Visual Studio for C++ Projects: https://dev.epicgames.com/documentation/en-us/unreal-engine/setting-up-visual-studio-development-environment-for-cplusplus-projects-in-unreal-engine
- Packaging Projects (UE 4.27, for the old File menu): https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-projects?application_version=4.27
- UE 5.6 release post (new Project Launcher UI): https://www.unrealengine.com/news/unreal-engine-5-6-is-now-available
- Packaged game paths (community wiki): https://unrealcommunity.wiki/packaged-game-paths-obtain-directories-based-on-executable-location-k9im2n3k
