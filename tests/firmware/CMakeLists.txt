cmake_minimum_required(VERSION 3.20)
project(espdesktop_firmware_tests LANGUAGES CXX)

enable_testing()
include(CheckCXXSourceCompiles)
find_package(Python3 REQUIRED COMPONENTS Interpreter)

add_executable(media_display_text_test media_display_text_test.cpp)
target_compile_features(media_display_text_test PRIVATE cxx_std_17)
target_compile_options(media_display_text_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(media_display_text_test PRIVATE stubs ../../components/espdesktop)
add_test(NAME media_display_text_test COMMAND media_display_text_test)
add_executable(dpi_timing_test dpi_timing_test.cpp)
target_compile_features(dpi_timing_test PRIVATE cxx_std_17)
target_compile_options(dpi_timing_test PRIVATE -Wall -Wextra -Werror -UNDEBUG)
target_include_directories(dpi_timing_test PRIVATE ../../components/mipi_dsi)
add_test(NAME dpi_timing_test COMMAND dpi_timing_test)
add_test(NAME p4_pipeline_runtime_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/p4_pipeline_runtime_test.py)
add_test(NAME mipi_dsi_draw_failure_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/mipi_dsi_draw_failure_test.py)

add_test(NAME gsl3680_startup_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/gsl3680_startup_test.py)

add_executable(foundation_test foundation_test.cpp)
target_compile_features(foundation_test PRIVATE cxx_std_17)
target_compile_options(foundation_test PRIVATE -Wall -Wextra -Werror)
add_test(NAME foundation_test COMMAND foundation_test)

add_executable(continuous_corners_test continuous_corners_test.cpp)
target_compile_features(continuous_corners_test PRIVATE cxx_std_17)
target_compile_options(continuous_corners_test PRIVATE -Wall -Wextra -Werror)
add_test(NAME continuous_corners_test COMMAND continuous_corners_test)
add_test(NAME card_curve_default_boot_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/card_curve_default_boot_test.py)
add_test(NAME card_curve_button_theme_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/card_curve_button_theme_test.py)
add_test(NAME network_status_corners_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/network_status_corners_test.py)

add_executable(theme_palette_test theme_palette_test.cpp)
target_compile_features(theme_palette_test PRIVATE cxx_std_17)
target_compile_options(theme_palette_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(theme_palette_test PRIVATE ../../components/espdesktop)
add_test(NAME theme_palette_test COMMAND theme_palette_test)

add_executable(theme_settings_test theme_settings_test.cpp)
target_compile_features(theme_settings_test PRIVATE cxx_std_17)
target_compile_options(theme_settings_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(theme_settings_test PRIVATE ../../components/espdesktop)
add_test(NAME theme_settings_test COMMAND theme_settings_test)

add_custom_command(
  OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/theme_modal_adapter.h
  COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/generate_theme_modal_test.py
    --header ${CMAKE_CURRENT_SOURCE_DIR}/../../components/espdesktop/button_grid_modal.h
    --output ${CMAKE_CURRENT_BINARY_DIR}/theme_modal_adapter.h
  DEPENDS generate_theme_modal_test.py ../../components/espdesktop/button_grid_modal.h
    ../../components/espdesktop/button_grid_subscriptions.h
    ../../components/espdesktop/card_availability.h
  VERBATIM)
add_executable(theme_runtime_tree_test theme_runtime_tree_test.cpp
  ${CMAKE_CURRENT_BINARY_DIR}/theme_modal_adapter.h)
target_compile_features(theme_runtime_tree_test PRIVATE cxx_std_17)
target_compile_options(theme_runtime_tree_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(theme_runtime_tree_test PRIVATE ../../components/espdesktop
  ${CMAKE_CURRENT_BINARY_DIR})
add_test(NAME theme_runtime_tree_test COMMAND theme_runtime_tree_test)
add_test(NAME theme_solar_validity_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/theme_solar_validity_test.py)
add_test(NAME theme_refresh_contract_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/theme_refresh_contract_test.py)

add_executable(digest_auth_policy_test digest_auth_policy_test.cpp)
target_compile_features(digest_auth_policy_test PRIVATE cxx_std_17)
target_compile_options(digest_auth_policy_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(digest_auth_policy_test PRIVATE ../../components/web_server_idf)
add_test(NAME digest_auth_policy_test COMMAND digest_auth_policy_test)

add_executable(companion_shortcut_test companion_shortcut_test.cpp)
target_compile_features(companion_shortcut_test PRIVATE cxx_std_17)
target_compile_options(companion_shortcut_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(companion_shortcut_test PRIVATE
  stubs
  ../../components/espdesktop
)
add_test(NAME companion_shortcut_test COMMAND companion_shortcut_test)
add_test(NAME companion_subpage_preference_boot_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/companion_subpage_preference_boot_test.py ${CMAKE_CXX_COMPILER})

add_test(NAME companion_navigation_preference_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/companion_navigation_preference_test.py)


add_executable(app_icon_custom_color_test app_icon_custom_color_test.cpp)
target_compile_features(app_icon_custom_color_test PRIVATE cxx_std_17)
target_compile_options(app_icon_custom_color_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(app_icon_custom_color_test PRIVATE ../../components/espdesktop)
add_test(NAME app_icon_custom_color_test COMMAND app_icon_custom_color_test)

add_executable(app_icon_layout_test app_icon_layout_test.cpp)
target_compile_features(app_icon_layout_test PRIVATE cxx_std_17)
target_compile_options(app_icon_layout_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(app_icon_layout_test PRIVATE ../../components/espdesktop)
add_test(NAME app_icon_layout_test COMMAND app_icon_layout_test)
add_test(NAME app_icon_layout_events_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/app_icon_layout_events_test.py ${CMAKE_CXX_COMPILER})
add_test(NAME instant_button_feedback_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/instant_button_feedback_test.py ${CMAKE_CXX_COMPILER})
add_test(NAME app_icon_pixel_lifetime_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/app_icon_pixel_lifetime_test.py ${CMAKE_CXX_COMPILER})

add_executable(companion_session_state_test companion_session_state_test.cpp)
target_compile_features(companion_session_state_test PRIVATE cxx_std_17)
target_compile_options(companion_session_state_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(companion_session_state_test PRIVATE ../../components/companion)
add_test(NAME companion_session_state_test COMMAND companion_session_state_test)

# Use the same JSON parser as ESPHome; the source archive is checksum pinned.
if(POLICY CMP0135)
  cmake_policy(SET CMP0135 NEW)
endif()
include(FetchContent)
FetchContent_Declare(ArduinoJson
  URL https://github.com/bblanchon/ArduinoJson/archive/refs/tags/v7.4.3.tar.gz
  URL_HASH SHA256=a2a8a277fc3cd0404499199bf1468682ea3688f354be0eaf6af8648366911257
)
FetchContent_MakeAvailable(ArduinoJson)
add_executable(companion_protocol_test companion_protocol_test.cpp)
target_compile_features(companion_protocol_test PRIVATE cxx_std_17)
target_compile_options(companion_protocol_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(companion_protocol_test PRIVATE ../../components/espdesktop)
target_link_libraries(companion_protocol_test PRIVATE ArduinoJson)
add_test(NAME companion_protocol_test COMMAND companion_protocol_test
  ${CMAKE_CURRENT_SOURCE_DIR}/../../compatibility/fixtures/companion_protocol_v4.json)

add_executable(companion_pairing_policy_test companion_pairing_policy_test.cpp)
target_compile_features(companion_pairing_policy_test PRIVATE cxx_std_17)
target_compile_options(companion_pairing_policy_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(companion_pairing_policy_test PRIVATE ../../components/espdesktop)
add_test(NAME companion_pairing_policy_test COMMAND companion_pairing_policy_test)

add_executable(companion_runtime_ownership_test companion_runtime_ownership_test.cpp
  ../../components/espdesktop/espdesktop_app_core.cpp
  ../../components/espdesktop/configuration_service.cpp
  ../../components/espdesktop/configuration_store.cpp)
target_compile_features(companion_runtime_ownership_test PRIVATE cxx_std_17)
target_compile_options(companion_runtime_ownership_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(companion_runtime_ownership_test PRIVATE stubs ../../components/espdesktop)
add_test(NAME companion_runtime_ownership_test COMMAND companion_runtime_ownership_test)

add_test(NAME web_ota_guard_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/web_ota_guard_test.py)
add_test(NAME web_event_source_lifecycle_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/web_event_source_lifecycle_test.py)

add_executable(button_grid_foundations_test button_grid_foundations_test.cpp)
target_compile_features(button_grid_foundations_test PRIVATE cxx_std_17)
target_compile_options(button_grid_foundations_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(button_grid_foundations_test PRIVATE
  stubs
  ../../components/espdesktop
)
add_test(NAME button_grid_foundations_test COMMAND button_grid_foundations_test)
add_test(NAME card_colour_rendering_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/card_colour_rendering_test.py ${CMAKE_CXX_COMPILER})

add_test(NAME compact_landscape_controls_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/compact_landscape_controls_test.py ${CMAKE_CXX_COMPILER})

add_executable(grid_navigation_service_test
  grid_navigation_service_test.cpp
  ../../components/espdesktop/espdesktop_app_core.cpp
  ../../components/espdesktop/configuration_service.cpp
  ../../components/espdesktop/configuration_store.cpp
)
target_compile_features(grid_navigation_service_test PRIVATE cxx_std_17)
target_compile_options(grid_navigation_service_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(grid_navigation_service_test PRIVATE ../../components/espdesktop)
add_test(NAME grid_navigation_service_test COMMAND grid_navigation_service_test)

add_executable(control_modal_service_test
  control_modal_service_test.cpp
  ../../components/espdesktop/espdesktop_app_core.cpp
  ../../components/espdesktop/configuration_service.cpp
  ../../components/espdesktop/configuration_store.cpp
)
target_compile_features(control_modal_service_test PRIVATE cxx_std_17)
target_compile_options(control_modal_service_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(control_modal_service_test PRIVATE ../../components/espdesktop)
add_test(NAME control_modal_service_test COMMAND control_modal_service_test)

add_executable(icons_legacy_alias_test icons_legacy_alias_test.cpp)
target_compile_features(icons_legacy_alias_test PRIVATE cxx_std_17)
target_compile_options(icons_legacy_alias_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(icons_legacy_alias_test PRIVATE ../../components/espdesktop)
add_test(NAME icons_legacy_alias_test COMMAND icons_legacy_alias_test)

add_executable(external_memory_allocator_test external_memory_allocator_test.cpp)
target_compile_features(external_memory_allocator_test PRIVATE cxx_std_17)
target_compile_options(external_memory_allocator_test PRIVATE -Wall -Wextra -Werror)
target_compile_definitions(external_memory_allocator_test PRIVATE USE_ESP32)
target_include_directories(external_memory_allocator_test PRIVATE
  stubs
  ../../components/espdesktop
)
add_test(NAME external_memory_allocator_test COMMAND external_memory_allocator_test)

add_executable(media_control_tabs_test media_control_tabs_test.cpp)
target_compile_features(media_control_tabs_test PRIVATE cxx_std_17)
target_compile_options(media_control_tabs_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(media_control_tabs_test PRIVATE ../../components/espdesktop)
add_test(NAME media_control_tabs_test COMMAND media_control_tabs_test)

add_executable(media_slider_lifecycle_test media_slider_lifecycle_test.cpp)
target_compile_features(media_slider_lifecycle_test PRIVATE cxx_std_17)
target_compile_options(media_slider_lifecycle_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(media_slider_lifecycle_test PRIVATE ../../components/espdesktop)
set(ESPDESKTOP_REQUIRED_FLAGS_SAVED "${CMAKE_REQUIRED_FLAGS}")
set(ESPDESKTOP_REQUIRED_LINK_OPTIONS_SAVED "${CMAKE_REQUIRED_LINK_OPTIONS}")
set(CMAKE_REQUIRED_FLAGS "${CMAKE_REQUIRED_FLAGS} -fsanitize=address -fno-omit-frame-pointer")
set(CMAKE_REQUIRED_LINK_OPTIONS "${CMAKE_REQUIRED_LINK_OPTIONS};-fsanitize=address")
check_cxx_source_compiles("int main() { return 0; }" ESPDESKTOP_HAS_ADDRESS_SANITIZER)
set(CMAKE_REQUIRED_FLAGS "${ESPDESKTOP_REQUIRED_FLAGS_SAVED}")
set(CMAKE_REQUIRED_LINK_OPTIONS "${ESPDESKTOP_REQUIRED_LINK_OPTIONS_SAVED}")
if(ESPDESKTOP_HAS_ADDRESS_SANITIZER)
  foreach(target media_slider_lifecycle_test)
    target_compile_options(${target} PRIVATE -fsanitize=address -fno-omit-frame-pointer)
    target_link_options(${target} PRIVATE -fsanitize=address)
  endforeach()
endif()
add_test(NAME media_slider_lifecycle_test COMMAND media_slider_lifecycle_test)

add_executable(slider_geometry_test slider_geometry_test.cpp)
target_compile_features(slider_geometry_test PRIVATE cxx_std_17)
target_compile_options(slider_geometry_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(slider_geometry_test PRIVATE ../../components/espdesktop)
add_test(NAME slider_geometry_test COMMAND slider_geometry_test)

add_executable(number_slider_policy_test number_slider_policy_test.cpp)
target_compile_features(number_slider_policy_test PRIVATE cxx_std_17)
target_compile_options(number_slider_policy_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(number_slider_policy_test PRIVATE ../../components/espdesktop)
add_test(NAME number_slider_policy_test COMMAND number_slider_policy_test)

add_executable(display_mode_controller_test display_mode_controller_test.cpp)
target_compile_features(display_mode_controller_test PRIVATE cxx_std_17)
target_compile_options(display_mode_controller_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(display_mode_controller_test PRIVATE ../../components/espdesktop)
add_test(NAME display_mode_controller_test COMMAND display_mode_controller_test)

add_executable(backlight_fade_test backlight_fade_test.cpp)
target_compile_features(backlight_fade_test PRIVATE cxx_std_17)
target_compile_options(backlight_fade_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(backlight_fade_test PRIVATE ../../components/espdesktop)
add_test(NAME backlight_fade_test COMMAND backlight_fade_test)

add_executable(configuration_store_test
  configuration_store_test.cpp
  ../../components/espdesktop/configuration_store.cpp
)
target_compile_features(configuration_store_test PRIVATE cxx_std_17)
target_compile_options(configuration_store_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(configuration_store_test PRIVATE ../../components/espdesktop)
add_test(NAME configuration_store_test COMMAND configuration_store_test)

add_executable(configuration_service_test
  configuration_service_test.cpp
  ../../components/espdesktop/configuration_service.cpp
  ../../components/espdesktop/configuration_store.cpp
)
target_compile_features(configuration_service_test PRIVATE cxx_std_17)
target_compile_options(configuration_service_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(configuration_service_test PRIVATE ../../components/espdesktop)
add_test(NAME configuration_service_test COMMAND configuration_service_test)

add_executable(panel_config_document_test panel_config_document_test.cpp)
target_compile_features(panel_config_document_test PRIVATE cxx_std_17)
target_compile_options(panel_config_document_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(panel_config_document_test PRIVATE ../../components/espdesktop)
add_test(NAME panel_config_document_test COMMAND panel_config_document_test)

add_executable(panel_config_capabilities_test
  panel_config_capabilities_test.cpp
)
target_compile_features(panel_config_capabilities_test PRIVATE cxx_std_17)
target_compile_options(panel_config_capabilities_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(panel_config_capabilities_test PRIVATE ../../components/espdesktop)
add_test(NAME panel_config_capabilities_test COMMAND panel_config_capabilities_test)

add_executable(panel_config_http_etag_test panel_config_http_etag_test.cpp)
target_compile_features(panel_config_http_etag_test PRIVATE cxx_std_17)
target_compile_options(panel_config_http_etag_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(panel_config_http_etag_test PRIVATE ../../components/espdesktop)
add_test(NAME panel_config_http_etag_test COMMAND panel_config_http_etag_test)

add_executable(panel_config_write_status_test panel_config_write_status_test.cpp)
target_compile_features(panel_config_write_status_test PRIVATE cxx_std_17)
target_compile_options(panel_config_write_status_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(panel_config_write_status_test PRIVATE ../../components/espdesktop)
add_test(NAME panel_config_write_status_test COMMAND panel_config_write_status_test)

add_executable(panel_config_storage_backend_test
  panel_config_storage_backend_test.cpp
  ../../components/espdesktop/configuration_store.cpp
)
target_compile_features(panel_config_storage_backend_test PRIVATE cxx_std_17)
target_compile_options(panel_config_storage_backend_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(panel_config_storage_backend_test PRIVATE ../../components/espdesktop)
add_test(NAME panel_config_storage_backend_test COMMAND panel_config_storage_backend_test)

add_executable(panel_config_storage_selection_test
  panel_config_storage_selection_test.cpp)
target_compile_features(panel_config_storage_selection_test PRIVATE cxx_std_17)
target_compile_options(panel_config_storage_selection_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(panel_config_storage_selection_test PRIVATE ../../components/espdesktop)
add_test(NAME panel_config_storage_selection_test COMMAND panel_config_storage_selection_test)

add_executable(panel_config_endpoint_policy_test
  panel_config_endpoint_policy_test.cpp)
target_compile_features(panel_config_endpoint_policy_test PRIVATE cxx_std_17)
target_compile_options(panel_config_endpoint_policy_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(panel_config_endpoint_policy_test PRIVATE ../../components/espdesktop)
add_test(NAME panel_config_endpoint_policy_test COMMAND panel_config_endpoint_policy_test)

add_executable(panel_config_legacy_adapter_test
  panel_config_legacy_adapter_test.cpp
  ../../components/espdesktop/panel_config_legacy_adapter.cpp
  ../../components/espdesktop/panel_config_runtime_adapter.cpp
  ../../components/espdesktop/panel_config_text_bindings.cpp
)
target_compile_features(panel_config_legacy_adapter_test PRIVATE cxx_std_17)
target_compile_options(panel_config_legacy_adapter_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(panel_config_legacy_adapter_test PRIVATE ../../components/espdesktop)
add_test(NAME panel_config_legacy_adapter_test COMMAND panel_config_legacy_adapter_test)

add_executable(espdesktop_app_core_test
  espdesktop_app_core_test.cpp
  ../../components/espdesktop/espdesktop_app_core.cpp
  ../../components/espdesktop/configuration_service.cpp
  ../../components/espdesktop/configuration_store.cpp
)
target_compile_features(espdesktop_app_core_test PRIVATE cxx_std_17)
target_compile_options(espdesktop_app_core_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(espdesktop_app_core_test PRIVATE ../../components/espdesktop)
add_test(NAME espdesktop_app_core_test COMMAND espdesktop_app_core_test)

add_executable(artwork_controller_test artwork_controller_test.cpp)
target_compile_features(artwork_controller_test PRIVATE cxx_std_17)
target_compile_options(artwork_controller_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(artwork_controller_test PRIVATE ../../components/espdesktop)
add_test(NAME artwork_controller_test COMMAND artwork_controller_test)

# Compile the unchanged service implementation beside the build output so its
# quoted artwork_image.h include resolves to the hardware-free test double.
configure_file(../../components/artwork_image/image_service.cpp image_service.cpp COPYONLY)
add_executable(image_service_test image_service_test.cpp ${CMAKE_CURRENT_BINARY_DIR}/image_service.cpp)
target_compile_features(image_service_test PRIVATE cxx_std_17)
target_compile_options(image_service_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(image_service_test PRIVATE stubs/artwork_image ../../components/artwork_image)
add_test(NAME image_service_test COMMAND image_service_test)

add_executable(bmp_stream_test bmp_stream_test.cpp)
target_compile_features(bmp_stream_test PRIVATE cxx_std_17)
target_compile_options(bmp_stream_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(bmp_stream_test PRIVATE ../../components/artwork_image)
add_test(NAME bmp_stream_test COMMAND bmp_stream_test)

add_executable(gif_player_test gif_player_test.cpp)
target_compile_features(gif_player_test PRIVATE cxx_std_17)
target_compile_options(gif_player_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(gif_player_test PRIVATE ../../components/artwork_image)
target_compile_definitions(gif_player_test PRIVATE GIF_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/gif")
add_test(NAME gif_player_test COMMAND gif_player_test)
add_test(NAME gif_runtime_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/gif_runtime_test.py)
add_test(NAME p4_gif_transfer_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/p4_gif_transfer_test.py)

add_executable(p4_scaling_test p4_scaling_test.cpp)
target_compile_features(p4_scaling_test PRIVATE cxx_std_17)
target_compile_options(p4_scaling_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(p4_scaling_test PRIVATE ../../components/artwork_image)
add_test(NAME p4_scaling_test COMMAND p4_scaling_test)

add_executable(image_pipeline_policy_test image_pipeline_policy_test.cpp)
target_compile_features(image_pipeline_policy_test PRIVATE cxx_std_17)
target_compile_options(image_pipeline_policy_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(image_pipeline_policy_test PRIVATE ../../components/artwork_image)
add_test(NAME image_pipeline_policy_test COMMAND image_pipeline_policy_test)

add_test(NAME display_schedule_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/display_schedule_test.py
  --compiler ${CMAKE_CXX_COMPILER})
add_executable(rgb565_scaler_test rgb565_scaler_test.cpp)
target_compile_features(rgb565_scaler_test PRIVATE cxx_std_17)
target_compile_options(rgb565_scaler_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(rgb565_scaler_test PRIVATE ../../components/artwork_image)
add_test(NAME rgb565_scaler_test COMMAND rgb565_scaler_test)

add_executable(scanline_resampler_test scanline_resampler_test.cpp)
target_compile_features(scanline_resampler_test PRIVATE cxx_std_17)
target_compile_options(scanline_resampler_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(scanline_resampler_test PRIVATE ../../components/artwork_image)
add_test(NAME scanline_resampler_test COMMAND scanline_resampler_test)
add_test(NAME image_resize_integration_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/image_resize_integration_test.py ${CMAKE_CXX_COMPILER})
add_test(NAME p4_jpeg_memory_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/p4_jpeg_memory_test.py ${CMAKE_CXX_COMPILER})
add_test(NAME artwork_release_memory_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/artwork_release_memory_test.py ${CMAKE_CXX_COMPILER})

file(GLOB SAVED_CONFIG_FIXTURES
  CONFIGURE_DEPENDS
  ${CMAKE_CURRENT_SOURCE_DIR}/../../common/config/*_card_normalization_fixtures.json
)
list(APPEND SAVED_CONFIG_FIXTURES
  ${CMAKE_CURRENT_SOURCE_DIR}/../../common/config/card_normalization_fixtures.json
)
set(SAVED_CONFIG_TEST_SOURCE ${CMAKE_CURRENT_BINARY_DIR}/saved_config_parser_test.cpp)
add_custom_command(
  OUTPUT ${SAVED_CONFIG_TEST_SOURCE}
  COMMAND
    ${Python3_EXECUTABLE}
    ${CMAKE_CURRENT_SOURCE_DIR}/../../scripts/generate_saved_config_parser_test.py
    --output ${SAVED_CONFIG_TEST_SOURCE}
  DEPENDS
    ${CMAKE_CURRENT_SOURCE_DIR}/../../scripts/generate_saved_config_parser_test.py
    ${CMAKE_CURRENT_SOURCE_DIR}/../../components/espdesktop/button_grid_config_parser.h
    ${CMAKE_CURRENT_SOURCE_DIR}/../../components/espdesktop/button_grid_saved_config_vacuum_generated.h
    ${CMAKE_CURRENT_SOURCE_DIR}/../../components/espdesktop/button_grid_subpages.h
    ${SAVED_CONFIG_FIXTURES}
  VERBATIM
)
add_executable(saved_config_parser_test ${SAVED_CONFIG_TEST_SOURCE})
target_compile_features(saved_config_parser_test PRIVATE cxx_std_17)
target_compile_options(saved_config_parser_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(saved_config_parser_test PRIVATE
  stubs
  ../../components/espdesktop
)
add_test(NAME saved_config_parser_test COMMAND saved_config_parser_test)

add_executable(settings_backlight_test settings_backlight_test.cpp)
target_compile_features(settings_backlight_test PRIVATE cxx_std_17)
target_compile_options(settings_backlight_test PRIVATE -Wall -Wextra -Werror)
add_test(NAME settings_backlight_test COMMAND settings_backlight_test)

add_executable(companion_discovery_test companion_discovery_test.cpp)
target_compile_features(companion_discovery_test PRIVATE cxx_std_17)
target_compile_options(companion_discovery_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(companion_discovery_test PRIVATE discovery_stubs)
add_test(NAME companion_discovery_test COMMAND companion_discovery_test)

add_executable(network_status_layout_test network_status_layout_test.cpp)
target_compile_features(network_status_layout_test PRIVATE cxx_std_17)
target_compile_options(network_status_layout_test PRIVATE -Wall -Wextra -Werror)
add_test(NAME network_status_layout_test COMMAND network_status_layout_test)

add_test(NAME companion_screensaver_test
  COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/companion_screensaver_test.py)

add_test(NAME subpage_runtime_cleanup_test
  COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/subpage_runtime_cleanup_test.py)

add_executable(panel_identity_runtime_beta_test panel_identity_runtime_test.cpp ../../components/espdesktop/panel_identity.cpp)
target_compile_features(panel_identity_runtime_beta_test PRIVATE cxx_std_17)
target_compile_options(panel_identity_runtime_beta_test PRIVATE -Wall -Wextra -Werror)
target_compile_definitions(panel_identity_runtime_beta_test PRIVATE TEST_ESPHOME_MINOR=11)
target_include_directories(panel_identity_runtime_beta_test PRIVATE panel_identity_stubs ../../components/espdesktop)
add_test(NAME panel_identity_runtime_beta_test COMMAND panel_identity_runtime_beta_test)

add_test(NAME clock_bar_grid_layout_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/clock_bar_grid_layout_test.py)

set(CLOCK_BAR_TITLE_TEST_SOURCE ${CMAKE_CURRENT_BINARY_DIR}/clock_bar_title_test.cpp)
add_custom_command(
  OUTPUT ${CLOCK_BAR_TITLE_TEST_SOURCE}
  COMMAND ${Python3_EXECUTABLE}
    ${CMAKE_CURRENT_SOURCE_DIR}/generate_clock_bar_title_test.py
    --header ${CMAKE_CURRENT_SOURCE_DIR}/../../components/espdesktop/clock_bar.h
    --output ${CLOCK_BAR_TITLE_TEST_SOURCE}
  DEPENDS
    generate_clock_bar_title_test.py
    clock_bar_title_test.cpp.in
    ../../components/espdesktop/clock_bar.h
    ../../components/espdesktop/button_grid_modal.h
  VERBATIM
)
add_executable(clock_bar_title_test ${CLOCK_BAR_TITLE_TEST_SOURCE})
target_compile_features(clock_bar_title_test PRIVATE cxx_std_17)
target_compile_options(clock_bar_title_test PRIVATE -Wall -Wextra -Werror)
add_test(NAME clock_bar_title_test COMMAND clock_bar_title_test)

add_executable(panel_identity_test panel_identity_test.cpp)
target_compile_features(panel_identity_test PRIVATE cxx_std_17)
target_compile_options(panel_identity_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(panel_identity_test PRIVATE ../../components/espdesktop)
add_test(NAME panel_identity_test COMMAND panel_identity_test)

add_executable(panel_identity_runtime_test panel_identity_runtime_test.cpp ../../components/espdesktop/panel_identity.cpp)
target_compile_features(panel_identity_runtime_test PRIVATE cxx_std_17)
target_compile_options(panel_identity_runtime_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(panel_identity_runtime_test PRIVATE panel_identity_stubs ../../components/espdesktop)
add_test(NAME panel_identity_runtime_test COMMAND panel_identity_runtime_test)
add_executable(reset_policy_test reset_policy_test.cpp)
find_package(Threads REQUIRED)
target_link_libraries(reset_policy_test PRIVATE Threads::Threads)
target_compile_features(reset_policy_test PRIVATE cxx_std_17)
target_compile_options(reset_policy_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(reset_policy_test PRIVATE ../../components/espdesktop)
add_test(NAME reset_policy_test COMMAND reset_policy_test)
add_test(NAME reset_ota_wrapper_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/reset_ota_wrapper_test.py)
add_test(NAME wifi_reset_override_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/wifi_reset_override_test.py)
add_test(NAME wifi_reset_boot_codegen_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/wifi_reset_boot_codegen_test.py)
add_test(NAME wifi_setup_address_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/wifi_setup_address_test.py)
add_test(NAME wifi_setup_package_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/wifi_setup_package_test.py)

add_test(NAME portrait_subpage_order_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/portrait_subpage_order_test.py)
add_test(NAME clock_screensaver_time_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/clock_screensaver_time_test.py)
add_executable(camera_refresh_policy_test camera_refresh_policy_test.cpp)
target_compile_features(camera_refresh_policy_test PRIVATE cxx_std_17)
target_compile_options(camera_refresh_policy_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(camera_refresh_policy_test PRIVATE ../../components/espdesktop)
add_test(NAME camera_refresh_policy_test COMMAND camera_refresh_policy_test)


add_test(NAME speaker_announcement_duck_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/speaker_announcement_duck_test.py)

add_test(NAME screen_lock_ui_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/screen_lock_ui_test.py ${CMAKE_CXX_COMPILER})

add_test(NAME app_icon_store_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/app_icon_store_test.py)
add_test(NAME navigation_refresh_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/navigation_refresh_test.py)

add_executable(rgb_frame_buffer_test rgb_frame_buffer_test.cpp)
target_compile_features(rgb_frame_buffer_test PRIVATE cxx_std_17)
target_compile_options(rgb_frame_buffer_test PRIVATE -Wall -Wextra -Werror -UNDEBUG)
add_test(NAME rgb_frame_buffer_test COMMAND rgb_frame_buffer_test)
add_test(NAME rgb_frame_present_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/rgb_frame_present_test.py)

add_executable(card_icon_size_test card_icon_size_test.cpp)
target_compile_features(card_icon_size_test PRIVATE cxx_std_17)
target_compile_options(card_icon_size_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(card_icon_size_test PRIVATE stubs ../../components/espdesktop)
add_test(NAME card_icon_size_test COMMAND card_icon_size_test)

add_test(NAME app_icon_preview_endpoint_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/app_icon_preview_endpoint_test.py)

add_executable(card_icon_layout_test card_icon_layout_test.cpp)
target_compile_features(card_icon_layout_test PRIVATE cxx_std_17)
target_compile_options(card_icon_layout_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(card_icon_layout_test PRIVATE ../../components/espdesktop)
add_test(NAME card_icon_layout_test COMMAND card_icon_layout_test)

add_test(NAME left_edge_navigation_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/left_edge_navigation_test.py ${CMAKE_CXX_COMPILER})

add_test(NAME default_icon_size_boot_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/default_icon_size_boot_test.py)

add_test(NAME multipart_header_fragments_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/multipart_header_fragments_test.py)

add_test(NAME multipart_upload_completion_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/multipart_upload_completion_test.py)

add_executable(connector_state_test connector_state_test.cpp)
target_compile_features(connector_state_test PRIVATE cxx_std_17)
target_compile_options(connector_state_test PRIVATE -Wall -Wextra -Werror)
target_include_directories(connector_state_test PRIVATE stubs ../../components/espdesktop)
add_test(NAME connector_state_test COMMAND connector_state_test)


add_test(NAME subpage_clock_bar_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/subpage_clock_bar_test.py)

add_test(NAME retired_camera_migration_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/retired_camera_migration_test.py ${CMAKE_CXX_COMPILER})

add_test(NAME card_retirement_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/card_retirement_test.py ${CMAKE_CXX_COMPILER})

add_test(NAME local_folder_wifi_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/local_folder_wifi_test.py ${CMAKE_CXX_COMPILER})

add_test(NAME retired_sensor_policy_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/retired_sensor_policy_test.py ${CMAKE_CXX_COMPILER})

add_test(NAME panel_diagnostics_endpoint_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/panel_diagnostics_endpoint_test.py
  ${CMAKE_CXX_COMPILER} ${arduinojson_SOURCE_DIR}/src)

add_test(NAME local_mixed_drivers_test COMMAND
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/local_mixed_drivers_test.py ${CMAKE_CXX_COMPILER})

add_test(NAME mac_network_icon_runtime_test COMMAND
  ${CMAKE_COMMAND} -E env "CXX=${CMAKE_CXX_COMPILER}"
  ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/mac_network_icon_runtime_test.py)

add_custom_command(
  OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/page_store_goldens.h
  COMMAND ${Python3_EXECUTABLE}
    ${CMAKE_CURRENT_SOURCE_DIR}/../../scripts/generate_page_store_goldens.py
    --output ${CMAKE_CURRENT_BINARY_DIR}/page_store_goldens.h
  DEPENDS ${PAGE_STORE_FIXTURES}
    ../../compatibility/fixtures/companion_nested_pages.json
    ../../common/config/card_normalization_fixtures.json
    ../../scripts/generate_page_store_goldens.py
    ../../scripts/generate_saved_config_parser_test.py
  VERBATIM)
add_executable(page_store_test page_store_test.cpp
  ${CMAKE_CURRENT_BINARY_DIR}/page_store_goldens.h
  ../../components/espdesktop/page_store.cpp)
target_compile_features(page_store_test PRIVATE cxx_std_17)
target_compile_options(page_store_test PRIVATE -Wall -Wextra -Werror -UNDEBUG)
target_include_directories(page_store_test PRIVATE stubs ../../components/espdesktop
  ${CMAKE_CURRENT_BINARY_DIR})
add_test(NAME page_store_test COMMAND page_store_test)


foreach(tool panel_config_document_v2_reader panel_config_projection_cli panel_config_import_cli)
  add_executable(${tool} ${tool}.cpp)
  target_compile_features(${tool} PRIVATE cxx_std_17)
  target_compile_options(${tool} PRIVATE -Wall -Wextra -Werror -UNDEBUG)
  target_include_directories(${tool} PRIVATE ../../components/espdesktop)
endforeach()
add_test(NAME panel_config_document_v2_test COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/panel_config_document_v2_test.py $<TARGET_FILE:panel_config_document_v2_reader>)

add_executable(grid_page_runtime_test grid_page_runtime_test.cpp
  ${CMAKE_CURRENT_BINARY_DIR}/page_store_goldens.h
  ../../components/espdesktop/page_store.cpp
  ../../components/espdesktop/page_store_runtime.cpp)
target_compile_features(grid_page_runtime_test PRIVATE cxx_std_17)
target_compile_options(grid_page_runtime_test PRIVATE -Wall -Wextra -Werror -UNDEBUG)
target_include_directories(grid_page_runtime_test PRIVATE stubs ../../components/espdesktop ${CMAKE_CURRENT_BINARY_DIR})
add_test(NAME grid_page_runtime_test COMMAND grid_page_runtime_test)

add_executable(page_store_v2_test page_store_v2_test.cpp
  ${CMAKE_CURRENT_BINARY_DIR}/page_store_goldens.h ../../components/espdesktop/page_store.cpp
  ../../components/espdesktop/page_store_runtime.cpp ../../components/espdesktop/configuration_service.cpp
  ../../components/espdesktop/configuration_store.cpp)
target_compile_features(page_store_v2_test PRIVATE cxx_std_17)
target_compile_options(page_store_v2_test PRIVATE -Wall -Wextra -Werror -UNDEBUG)
target_include_directories(page_store_v2_test PRIVATE stubs ../../components/espdesktop ${CMAKE_CURRENT_BINARY_DIR})
add_test(NAME page_store_v2_test COMMAND page_store_v2_test)

add_executable(page_store_runtime_test page_store_runtime_test.cpp
  ../../components/espdesktop/page_store.cpp ../../components/espdesktop/page_store_runtime.cpp
  ../../components/espdesktop/configuration_service.cpp ../../components/espdesktop/configuration_store.cpp)
target_compile_features(page_store_runtime_test PRIVATE cxx_std_17)
target_compile_options(page_store_runtime_test PRIVATE -Wall -Wextra -Werror -UNDEBUG)
target_include_directories(page_store_runtime_test PRIVATE stubs ../../components/espdesktop)
add_test(NAME page_store_runtime_test COMMAND page_store_runtime_test)

add_executable(configuration_main_loop_test configuration_main_loop_test.cpp
  ../../components/espdesktop/configuration_main_loop.cpp
  ../../components/espdesktop/configuration_service.cpp ../../components/espdesktop/configuration_store.cpp)
target_compile_features(configuration_main_loop_test PRIVATE cxx_std_17)
target_compile_options(configuration_main_loop_test PRIVATE -Wall -Wextra -Werror -UNDEBUG)
target_include_directories(configuration_main_loop_test PRIVATE ../../components/espdesktop)
target_link_libraries(configuration_main_loop_test PRIVATE Threads::Threads)
add_test(NAME configuration_main_loop_test COMMAND configuration_main_loop_test)

foreach(tool panel_config_transient_storage_test panel_config_upload_test)
  add_executable(${tool} ${tool}.cpp ../../components/espdesktop/configuration_store.cpp)
  target_compile_features(${tool} PRIVATE cxx_std_17)
  target_compile_options(${tool} PRIVATE -Wall -Wextra -Werror -UNDEBUG)
  target_include_directories(${tool} PRIVATE ../../components/espdesktop ../../components/web_server_idf)
  add_test(NAME ${tool} COMMAND ${tool})
endforeach()
add_test(NAME panel_config_import_test COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/panel_config_import_test.py $<TARGET_FILE:panel_config_import_cli>)
add_test(NAME panel_config_projection_test COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/panel_config_projection_test.py $<TARGET_FILE:panel_config_projection_cli>)
add_test(NAME panel_config_navigation_policy_test COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/panel_config_navigation_policy_test.py)
add_test(NAME panel_config_empty_defaults_codegen_test COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/panel_config_empty_defaults_codegen_test.py)

add_test(NAME native_document_browser_parity COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/../../scripts/check_native_document_conversion.js $<TARGET_FILE:panel_config_projection_cli> $<TARGET_FILE:panel_config_import_cli>)
add_test(NAME nested_page_document_paths COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/../../scripts/check_nested_page_document.js)

target_compile_definitions(panel_config_transient_storage_test PRIVATE USE_ESP32)
target_include_directories(panel_config_transient_storage_test PRIVATE config_storage_stubs)
target_sources(panel_config_transient_storage_test PRIVATE ../../components/espdesktop/panel_config_espidf_storage.cpp)

add_test(NAME nested_folder_state_test COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/nested_folder_state_test.py)

add_test(NAME application_shutdown_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/application_shutdown_test.py ${CMAKE_CXX_COMPILER})

add_test(NAME companion_mute_cleanup_test COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/companion_mute_cleanup_test.py ${CMAKE_CXX_COMPILER})
