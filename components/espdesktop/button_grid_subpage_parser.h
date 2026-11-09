#pragma once

// Parser-only adapter for translation units without LVGL. Keep the production
// grid's parser as the single source of card normalization semantics.
#include "i18n_generated.h"
#define ESPDESKTOP_CONFIG_PARSER_ONLY
#include "button_grid_config_parser.h"
#undef ESPDESKTOP_CONFIG_PARSER_ONLY
#define ESPDESKTOP_SUBPAGE_PARSER_ONLY
#include "button_grid_subpages.h"
#undef ESPDESKTOP_SUBPAGE_PARSER_ONLY
