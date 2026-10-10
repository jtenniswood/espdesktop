"""Run production owned-buffer loading against decode/I/O doubles."""
from pathlib import Path
import re
import subprocess
import sys
import tempfile
root=Path(__file__).resolve().parents[2]
text=(root/'components/artwork_image/artwork_image.cpp').read_text()
def body(name):
    start=text.index('bool ArtworkImage::'+name+'(') if name!='fail_download_' else text.index('void ArtworkImage::'+name+'(')
    end=text.index('\n}',start)+2
    return text[start:end]
owned=body('load_owned_buffer')
complete=re.search(r'TransferObserver::instance\(\)\.complete\([^;]+;',body('finish_download_')).group()
failed=re.search(r'TransferObserver::instance\(\)\.complete\([^;]+;',body('fail_download_')).group()
source=r'''
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <string>
#include "transfer_observer.h"
#define ESP_LOGE(...) ((void)0)
namespace esphome {
uint32_t millis() { return 1; }
struct AppStub { void feed_wdt() {} } App;
namespace artwork_image {
enum class ImageFormat { AUTO, JPEG };
struct Buffer { bool adopt(uint8_t*,size_t) { return true; } size_t unread() { return 0; } };
struct Decoder { bool is_finished() { return true; } };
struct ArtworkImage {
  size_t max_download_buffer_size_=64, completed_transfer_bytes_=0, peak_download_buffer_size_=0;
  bool update_pending_=true, last_error_was_ha_media_proxy_=true, invalid_format=false;
  std::string pending_url_;
  uint32_t request_started_ms_=0,response_ready_ms_=0,first_byte_ms_=0,transfer_complete_ms_=0,decode_started_ms_=0;
  int last_http_status_=200;
  uint32_t service_generation_=9;
  TransferStamp transfer_stamp_;
  TransferFailure transfer_failure_=TransferFailure::CONTENT;
  Buffer download_buffer_; Decoder decoder; Decoder *decoder_=&decoder;
  void end_connection_() {} void cancel_service_request_() {}
  ImageFormat detect_format_() { return invalid_format?ImageFormat::AUTO:ImageFormat::JPEG; }
  bool create_decoder_(ImageFormat,size_t) { return true; }
  bool decode_buffered_data_() { return true; }
  bool finish_download_() {
'''+complete+r'''
    return true;
  }
  void fail_download_() {
'''+failed+r'''
  }
  bool load_owned_buffer(uint8_t*,size_t,bool*);
};
'''+owned+r'''
}}
int main() {
 using namespace esphome::artwork_image;
 auto &observer=TransferObserver::instance(); int notices=0;
 observer.set([](const std::string&) { return 7u; },[&](const TransferNotice&) { ++notices; });
 uint8_t data[16]{}; bool decoded=false;
 for(bool invalid_format:{false,true}) {
  ArtworkImage image; image.invalid_format=invalid_format;
  image.transfer_stamp_=observer.begin("http://ha:8123/api/media_player_proxy/player",9);
  assert(!image.load_owned_buffer(nullptr,sizeof(data),&decoded));
  assert(image.transfer_stamp_.endpoint_generation==7); // Rejected input cannot cancel valid HTTP work.
  assert(image.load_owned_buffer(data,sizeof(data),&decoded));
  assert(decoded==!invalid_format && notices==0);
  assert(image.transfer_stamp_.endpoint_generation==0);
 }
 observer.set({},{});
}
'''
with tempfile.TemporaryDirectory() as temporary:
    p=Path(temporary);(p/'test.cpp').write_text(source)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'c++','-std=c++17','-Wall','-Wextra','-Werror','-I',str(root/'components/artwork_image'),str(p/'test.cpp'),'-o',str(p/'test')],check=True)
    subprocess.run([str(p/'test')],check=True)
print('Owned Companion artwork never reports canceled HA transfer outcomes.')
