# 南海决战 ship and aircraft models

Each `<key>.txt` is base64 of a gzipped GLB (WebP textures, quantized geometry; aircraft
and the Type 051 also simplified). `src/navyhd.js` decodes and fits them to the game frame.

| file | model | author | license |
|---|---|---|---|
| ford.txt | [Gerald R Ford aircraft Carrier](https://sketchfab.com/3d-models/gerald-r-ford-aircraft-carrier-562bf516e1494df38d8f222504dc798b) | waelXcm | CC BY 4.0 |
| nimitz.txt | [USS Nimitz class aircraft carrier](https://sketchfab.com/3d-models/uss-nimitz-class-aircraft-carrier-e9f23bab3bd14f34ba9e54ccd082f46d) | k26_k29 | CC BY 4.0 |
| burke.txt | [Alreigh Burke Destroyer](https://sketchfab.com/3d-models/alreigh-burke-destroyer-52a04129e8f64134ae26d365c4e82ce7) | waelXcm | CC BY 4.0 |
| t055.txt | [Type 055 Renhai class destroyer [Free]](https://sketchfab.com/3d-models/type-055-renhai-class-destroyer-free-c0a3c5cb49fd4b688b65e4f3a18b5917) | andertan | CC BY-ND 4.0 (format conversion only, geometry unchanged) |
| t051.txt | Chinese PLAN 051 Class Destroyer | 全斗焕 (sketchfab.com/lxyun_2) | CC BY 4.0 |
| fa18.txt | [Boeing F/A-18E "Super Hornet"](https://sketchfab.com/3d-models/boeing-fa-18e-super-hornet-9e852037bf2141dcb3fda17013958131) | KOG_THORNS | CC BY 4.0 |
| f35.txt | [F-35 Lightning II - Fighter Jet - Free](https://sketchfab.com/3d-models/f-35-lightning-ii-fighter-jet-free-b1ab1c0090e34b0fbfe667e706023e6d) | bohmerang | CC BY-NC-SA 4.0 |
| e2d.txt | [Grumman E-2D Advanced Hawkeye](https://sketchfab.com/3d-models/grumman-e-2d-advanced-hawkeye-0082cf8f15044cfd80ebd4e11b96789d) | Muhamad Mirza Arrafi | CC BY 4.0 |

Stand-ins in the game: the Nimitz model plays Fujian, the E-2D plays KJ-600 and the F-35 plays J-35,
desaturated and tinted at runtime; the Type 055 also plays the two 052Ds; the Burke plays the Ticonderoga;
the Type 051 plays the 054A.
