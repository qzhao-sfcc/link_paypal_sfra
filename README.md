# link_paypal_sfra

This is repsitory setup for paypal end to end integration with SFRA sandbox website. The idea is by pulling this repsitory following quick setup setups on both commerce cloud and paypal sandboxes. The standard website is ready to show end to end integartion.

This repository is inherited from the public repository on marketplace for paypal integration but for SFRA site only with hand picked information. 


TO SETUP:
Commerce cloud sanbox: Please refer to /reference/SFRA Integration Guide.pdf guide 3.2 section
Paypal sandbox setup: https://developer.paypal.com/docs/classic/lifecycle/sb_create-accounts/

NOTE: 
1. After paypal sandbox setup, there will be one buyer account and one business account addtional with personal paypal account. The user needs to use https://developer.paypal.com/developer/accounts/ to link sandbox account with personal paypal account. 

2. The integraiton setup in business manager should use paypal business account api key and password. Please be aware of testing environment vs production environment URL!

3. To access testing transactions in paypal, please go to https://www.sandbox.paypal.com/uk/home and login with given mock buyer account and business accound accordingly.


4. To install cartridges to the site, 
  a. For int_paypal_sfra, copy int_paypal_sfra folder to target website folder and add standard compiling package node_modules to int_paypal_sfra folder. Build with standard command line npm run compile:js && npm run compile:scss
  b. For bm_paypal, copy bm_paypal folder to target website folder, build the cartridge using standard npm run compile:js.
  c. Upload both cartridges.
  d. configure BM caridge path to be: bm_paypal:int_paypal_sfra:app_storefront_base  
