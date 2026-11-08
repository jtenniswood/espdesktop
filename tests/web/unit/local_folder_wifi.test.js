"use strict";
const { test }=require("node:test");
const assert=require("node:assert/strict");
const { loadTypescriptTest }=require("./helpers/load_typescript_test");
const path=require("node:path"), Module=require("node:module"), esbuild=require("esbuild");
const root=path.resolve(__dirname,"../../..");
const bundled=esbuild.buildSync({stdin:{contents:`
 export { registerSubpageCardTypes } from "./src/webserver/cards/subpage";
 import { initializeDeviceConfig } from "./src/webserver/device_config";
 import { initializeAppState } from "./src/webserver/state/app_instance";
 initializeDeviceConfig(); initializeAppState();
`,resolveDir:root,loader:"ts"},bundle:true,platform:"node",format:"cjs",write:false,logLevel:"silent",
 define:{__ESPDESKTOP_DEFAULT_DEVICE_ID__:JSON.stringify("test"),
 __ESPDESKTOP_DEVICE_PROFILES__:JSON.stringify({test:{slots:1,cols:1,rows:1,features:{},timezoneOptions:[]}}),
 __ESPDESKTOP_TIMEZONE_OPTIONS__:"[]"}}).outputFiles[0].text;
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=module.paths;loaded._compile(bundled,__filename);
const { registerSubpageCardTypes }=loaded.exports;
function node(){return {children:[],appendChild(child){this.children.push(child);},addEventListener(){}};}
test("legacy folder state fields stay saved while only local navigation modes are offered",()=>{
 const previous=global.document;global.document={createElement:node};
 try{
  const definitions={};
  registerSubpageCardTypes({register(key,value){definitions[key]=value;return value;}},{enterChildSubpage(){},canCreateSubpage(){return true;}},{},{closeSettings(){}},{fieldLabel:node},{renderButtonSettings(){}});
  for(const sensor of ["indicator","sensor.room",""]){
   const card={type:"subpage",entity:"climate.room",sensor,label:"Room",icon:"Folder",options:"subpage_kind=climate,subpage_connector=home_assistant",unit:"°C",precision:"1"};
   const before=JSON.stringify(card),panel=node();let offered;
   definitions.subpage.renderSettings(panel,card,1,{
    renderCardModeSelector(_panel,_card,_helpers,metadata){offered=metadata.mode.options;},
    renderCardTextField(){},renderCardIconPicker(){},
   });
   assert.equal(JSON.stringify(card),before);
   assert.deepEqual(offered,[["","Subpage"],["companion_stat","Companion Stat"]]);
   assert(panel.children.some(child=>child.textContent?.includes("folder still opens")));
   assert(panel.children.some(child=>child.textContent==="Edit Subpage"));
  }
 }finally{global.document=previous;}
});
