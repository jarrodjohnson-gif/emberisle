# Audio originals (#1073)

The originals are not duplicated in the repo. They are in git history at commit `8d5e23c` (the last commit before levelling), and
`node scripts/level-audio.mjs` reads them from there and writes the leveled files over `public/audio/`, so running it twice gives
the same bytes (checked) and never levels a file twice. Needs ffmpeg and git history that contains `8d5e23c`.

Types and targets, from the owner decision of 2026-10-24: reactions and soundboard clips -16 LUFS, music and stings -18 LUFS,
table effects -18 (short-clip K-weighted loudness of the active part, on the LUFS scale). True peak at or below -1 dBTP. See
`scripts/audio-level-lib.mjs` for the exact method and `npm run audio-level-prove`.

Hashes are SHA-256. The leveled hashes are for the ffmpeg 6.x libmp3lame/pcm encoders used here; another ffmpeg may encode an
mp3 to different bytes with the same levels.

| File | Original | Leveled |
|---|---|---|
| `back_001.wav` | `6fb44d6dc1fd0bbc1e7abb586bab4a838719f91428af2648a37d4acdc7530617` | `1b705cdd12230ce982ad67d9d313034dd23119f00a3af08c7b72067659a34bb9` |
| `bong_001.wav` | `f5d5f83b13edc5321352c2ba57972d1400151e3f27f1c18fcda07d261358511a` | `5a7d0f696248a9b85b342d36c55ea066a948470b60a13dc3f9482c0326ad14df` |
| `chat_recv.wav` | `f84a2a25ba8a814670041f21df24f9820a74e83208d091e35994583c3b0650b0` | `338009d16dea2f0b3a2bd65e5ce00c81f872da57b6a3d6097d9343544de36f67` |
| `chat_send.wav` | `5065d915985fd2f4daf0f3481f6546a462573bb3fbc4a1dc0ffc290e4a795155` | `7b1c61f177e2bf150f39044b6e4d2ba97ea1ac840351c6ae5bc4e418342a5196` |
| `click_001.wav` | `ea67c9d78750e5a356bf53ef8c2063b52cc3ccdae6ae8afeec87f97f79ae692d` | `02ce69eec400bfcdf6babf2295093a17a5bc8a17ce30e3ba01f9cf945ee477c0` |
| `click_002.wav` | `3ebdb096e13b11d2ff1383e035847acb6a70e159edfb06bc94d59cbe40b1b713` | `9037ec683e7ec0e9c988026069debc8738e693c0fa6bf70c720da44248ff8373` |
| `click_005.wav` | `d6006cd60538f3e02d9d2980bff5fb73481b9d5abf1145761739e09baec640ee` | `748b17a71eee530a001d59df186cff5e0a50a19b21178f10e1cdc71af4380331` |
| `confirmation_001.wav` | `f9d0ef5a5c740c2ac250ac3876db9e4340669044a5bf78ae09192918db3e2ebc` | `62b4b1f15eeb0c9bb2a5f5241be6a801cc8a82f56249b0851cb7c5fc145e3807` |
| `drop_001.wav` | `0aa0b07692c5d37177f078c39d246d12f2685b553ed06887671797737e5cd432` | `ae31e278344744f4fceeb726f559cf30a369a0d4ac93173c2574a17c56c22d4d` |
| `drop_002.wav` | `72973e674ac557ebf29a843c6cc39bc9c7682bd684a737ba46812eea32cac21e` | `f836eba1ea3342812d4593a49d062aa62bcd71707045c752e50bcf05f5e4b2d3` |
| `drop_003.wav` | `c62109152dd126f65fcae62775c5f42e7ccc646edeae770a2b62e33e82f054a0` | `6f9c3c6a4eb4c07fa88b268df85a00efd12d11a618ec0a48f7344b298f5e1fb0` |
| `drop_004.wav` | `8bec0bc73a2536c81467790f41529a0c335b3915baa2caf3d248b6ebacce93a2` | `9fabd890facc802ff0b279e5bcc9095816d0d32930f26f09b3b661878b135b91` |
| `end_music.mp3` | `bf8fe3970d7614fe6fac6ce909caf79cd04ef364237e42aa67a8abf2ec034d74` | `d52a42a232181023a910ecfe6adf71484db006647cc86fcfeb2cc130b47bbafd` |
| `error_001.wav` | `d77546b0baa89f37eca6b86f59b54a654ce5afe3d5a73492d0963168cc4ab5bf` | `d1548b317b7e1c97e8a7bb59ea652c3ec66fc10bf3ad82969be677504fb99a2c` |
| `error_002.wav` | `4d48b7d740ccb35d74fed1cfca1a4efd826659ad295bd0b0f907e5d56918dbac` | `1dea5268a9c1c3f5c85ca48d96ecf90fc66cfcbf1e5ad8f290c2bd76da4a4170` |
| `game_lose.mp3` | `7a21ade91762874e2b21be21efa15436bcc49e88ffb98d16cf597618caebfa93` | `4037043614df1b1219f22da02e2e810889ff8da0e09c99266a7378b668fed0de` |
| `game_start.mp3` | `2a1a36e036c776bc030bf79ef69e312e6bbe0bc96b9ee0f30956ff4aad30ae4b` | `c3e95be7f5ab171b1922a7c4c9447f529315c479033078038796fce840785909` |
| `match_point.mp3` | `1c45d5f18fa52ede20d3f44ea1ea87f61e517b2c8dfb69794d1e5799ec7ebb16` | `6394f6bc95a99c7a5e48e7c7f0024add478ad2580bab069ad33cef814a374890` |
| `old_tower_inn_loop.mp3` | `e9d797fbf7a246e0970603c7521a35b884d27ab1e6517224cc29bbb8591aea45` | `a559f6560ac710fda9617016c039aa872936cd7c60ca0552f021b8011283b827` |
| `open_001.wav` | `c69aab75d09d98363934c68cda0e9d050973eb5c3ab9987ce8fd5d336a8f7fbd` | `49bfc3369ba66858c72be4183774d512d1d3b1621698cd447bec776d220d70e5` |
| `plop.wav` | `1592cd525de2bcdb3bff90a7c5a4973244374f019596389ebed1b142b4a8adcf` | `626a7f465a81ee5035ddfb9cd35974522dac064ab026faf5ef7c4adae69d73cb` |
| `pluck_001.wav` | `7d676b0b09b56f7e5964ad274feb7e7307a4e552bed8cd98e1e3cecfb9c10c36` | `293c7eb7a39dded73ab83aecdbd4888ef9bdc65e912ad9f0bb5b61df8aa601fa` |
| `robbed_fah.mp3` | `f65311d5eea216616cde00edc9e0ee0e2be1f5a03aeeb5aef8b23d55f676826a` | `700305f7a6d87a760da1612eede70a67a3a665e4c7e93eb1d7e445d6e42e352a` |
| `sb_airhorn.mp3` | `95beb8827452fab91d38535bbfd359b5e59547e2f98a937cb01032d3dced930c` | `2658602ae4ceb45e37c1d1624b8c3b81e7f8def4903f133f53b41691c9f39def` |
| `sb_only_wood.mp3` | `3f78b4b86766f4c352ddb77d1f1c60aaecf23b9e802640e00d6a6c406dcb6c14` | `4d85326b8402b90a53d4e1a3bc8f6b1963ef0eb728a6ab3bc89cb1496a10308e` |
| `sb_perfect.mp3` | `d5db12a011b05cd7a79ecc82a52d670b2edcee2290023e1950a12fecccc58fa7` | `f799efd83c6e5f56ed0d4f3abee396710d946d0d39fc94cfb2f6555950578116` |
| `sb_plump_sheep.mp3` | `fe4945b45b3a962a91fa07d8445276c872226dd0f764f0931d24f708ed2f730c` | `3ed69751163970858e685b9fc2b347ae9256732a6f8fe10cedc232de2187b8ba` |
| `sb_quit_touchin.mp3` | `e8ccfdab750e6093ca983c9422e50c48b08181053ef4e1e1b890fc1a7c889ed5` | `1ed47ed8685848edaf55c8b547de50d8cfd8c15b31cad80e7411a5fd01c56f15` |
| `sb_win_reaction.mp3` | `92a7c39e348293dd85c92b64c0f838257b39997cec42577d203d478927237160` | `6faa97fa468f0bc170d981a47f7e9d17fc2722ac1b700da74459229ee83af35c` |
| `sb_wololo.mp3` | `503f5acd070df7aa6174c59e1982f633bfb0065244843075bdd810253bce4cfe` | `469845780e54e6be5b6dbffc87d69aebbe3fe8cd6205c4a682ed28f66c5c5f86` |
| `scratch_001.wav` | `8db53f023af3410573861dc7b434a052965b6282573b999af17e31d23557d7d2` | `9ffb7fd211edbe41ab9c2d5e88931e22a14bfbd17b47f2f0c2c1f45a9d6dd2ed` |
| `tap_fields.wav` | `4b6c26a8469ad92b40a47e9ae1006ca2c2099f3fe744c7ee79cf8c5ae7116161` | `852576f5ace3290df64c6183a9e16475a5a1344c149a2db16f71c1e1b28ba349` |
| `tap_forest.wav` | `63b8faaa242d44e875b5624b35bccde478e0fd2e6c36f41231165c66c1dd38f8` | `7f4aff223013913478a75bd0bc7762cd18872f75dcb0775c9fcd8a574e32ebbc` |
| `tap_hills.wav` | `2a671a29cbc2ce6d448c9b498ba93d895a736630b9165052a5a768d603dca7a0` | `093766b8d42a50048cc13a0f816c45438308d57c6a66683a01b079a437d4cb00` |
| `tap_mountains.wav` | `181998f967c99b5891b12366585cf92b759cac0bea6e48b23da372f13644a7f4` | `73ca25e3c3f884750e406ad79cae621aa60a9a887574af3af2624ec9e73cceec` |
| `tap_waste.wav` | `7b85f864a8e7218f3ed6b7a23b84322c1595c0a2af6334d4c0775d7af3f9fcf5` | `9b34a81eae2186c6a1009f75627720ceb83b13ccaa83e10fe7114df154ed0288` |
| `timer_final.wav` | `e4a853f1a119e39b428693ff6d25a783cfa450c871d5654146d4069efe79018a` | `84997ed0824fa40ea027f593526d72be7d1449eaf9f9c05595bfc35f6a4b99a7` |
| `timer_tick.wav` | `41b2ba471c2145b74b5f71feee41951aa90b7b381d7085c6ef47ce25d7b3411a` | `b1dffa33cd8004e1ed78ec160035f40a1764d524816ef978c4a52a52523f7eed` |
| `trade_offer.wav` | `315f1275ac9855ebc6ccadb9208527769c858fbcadd588ba4d08a7f8ca7323db` | `0743a9c39f3cbff1b1bf7468cdbb1bb9a3c6c1d042017214d8d3f315ccb9d8c4` |
| `wayfarer_move.wav` | `a28eed00585d095b8bc82735fcdad04b13f4c08d8304c3ac45fabc84991b2357` | `8d85568918f6e16d22d6db41c805bf471c47cfa5e073f8a35730d5fa18eebb73` |
| `your_turn.wav` | `68fb2202354fee39c24d0531a691144bc7dcc7e9023a25a1e60a11d62a0a6cc0` | `3926209895106170260a4a8f2720dc9736232628cf98a0bbb63ecb298af90f4d` |
