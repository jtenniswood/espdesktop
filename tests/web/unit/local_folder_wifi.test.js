"use strict";
const { test }=require("node:test");
const assert=require("node:assert/strict");
const { loadTypescriptTest }=require("./helpers/load_typescript_test");
const { registerSubpageCardTypes }=loadTypescriptTest("src/webserver/cards/subpage.ts");
const { registerWifiQrCardTypes }=loadTypescriptTest("src/webserver/cards/wifi_qr.ts");
const { createConfigModalTabOptionsFeature }=loadTypescriptTest("src/webserver/application/config_modal_tab_options.ts");
function node(){return {children:[],appendChild(child){this.children.push(child);},addEventListener(){}};}
test("legacy folder state fields stay saved while only local navigation modes are offered",()=>{
 const previous=global.document;global.document={createElement:node};
 try{
  const definitions={};
  registerSubpageCardTypes({register(key,value){definitions[key]=value;return value;}},{enterSubpage(){}},{},{closeSettings(){}},{fieldLabel:node},{renderButtonSettings(){}});
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
test("saved guest switches do not restore HA controls or erase QR credentials",()=>{
 const previous=global.document;const document={createElement:node};global.document=document;
 try{
  const definitions={},tabs=createConfigModalTabOptionsFeature({document,renderButtonSettings(){}});let modal;
  tabs.renderModalTabSettings=(_panel,_card,_helpers,config)=>{modal=config;};
  registerWifiQrCardTypes({register(key,value){definitions[key]=value;}},tabs,{}, {renderButtonSettings(){}},{supported:()=>true,homeAssistantSupportEnabled(){throw Error("retired connector queried");}});
  const card={type:"wifi_qr",entity:"switch.guest_wifi",label:"Connect",icon:"Wifi",icon_on:"Auto",sensor:"",unit:"",precision:"",options:"ssid64=VGVzdA,pass64=cGFzcw,wifi_tabs=guest"};
  const before=JSON.stringify(card),panel=node();
  const helpers={idPrefix:"test-",renderCardModeSelector(){},renderCardTextField:()=>({field:node()}),markCardPrimaryField(){},disclosureSection:()=>({panel:node(),section:node()}),renderCardEntityField(){throw Error("retired switch editor rendered");}};
  definitions.wifi_qr.renderSettingsBeforeLabel(panel,card,1,helpers);
  assert.deepEqual(modal.definitions().map(tab=>tab.value),["qr","credentials"]);
  assert.deepEqual(modal.tabs(card),[],"retirement must not enable previously hidden credentials");
  assert.equal(modal.normalizeOptions(card.options),card.options);
  assert.equal(JSON.stringify(card),before);
 }finally{global.document=previous;}
});
