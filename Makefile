PLUGIN_ID  := entities
DIST_DIR   := dist
ZIP_NAME   := $(PLUGIN_ID).zip

# Read VAULT_PLUGIN_DIR from vault.config.mjs at make-time
VAULT_DIR  := $(shell node --input-type=module \
	--eval "import { VAULT_PLUGIN_DIR } from './vault.config.mjs'; process.stdout.write(VAULT_PLUGIN_DIR)" \
	2>/dev/null)

.PHONY: all build build-plugin build-views package clean

## Default: build everything and package
all: build package

## Build the main plugin and all views
build: build-plugin build-views

## Build main plugin only (outputs to vault dir)
build-plugin:
	npm run build --prefix .

## Build all view bundles (outputs to views/*/dist/ and vault dir)
build-views:
	npm run build -w views/person
	npm run build -w views/org
	npm run build -w views/meeting

## Package build artifacts into a zip ready for manual Obsidian deployment
##
## Zip layout (matches Obsidian plugin structure):
##   entities/
##     main.js
##     styles.css
##     manifest.json
##     views/
##       person/index.js
##       org/index.js
package:
	@if [ -z "$(VAULT_DIR)" ]; then \
		echo "Error: could not read VAULT_PLUGIN_DIR from vault.config.mjs"; exit 1; \
	fi
	rm -rf $(DIST_DIR)/$(PLUGIN_ID)
	mkdir -p $(DIST_DIR)/$(PLUGIN_ID)/views/person
	mkdir -p $(DIST_DIR)/$(PLUGIN_ID)/views/org
	mkdir -p $(DIST_DIR)/$(PLUGIN_ID)/views/meeting
	cp $(VAULT_DIR)/main.js $(VAULT_DIR)/styles.css $(VAULT_DIR)/manifest.json \
		$(DIST_DIR)/$(PLUGIN_ID)/
	cp views/person/dist/index.js  $(DIST_DIR)/$(PLUGIN_ID)/views/person/index.js
	cp views/org/dist/index.js     $(DIST_DIR)/$(PLUGIN_ID)/views/org/index.js
	cp views/meeting/dist/index.js $(DIST_DIR)/$(PLUGIN_ID)/views/meeting/index.js
	cd $(DIST_DIR) && zip -r $(ZIP_NAME) $(PLUGIN_ID)
	@echo ""
	@echo "Packaged: $(DIST_DIR)/$(ZIP_NAME)"
	@echo "Install:  unzip into <vault>/.obsidian/plugins/"

## Remove dist directory
clean:
	rm -rf $(DIST_DIR)
