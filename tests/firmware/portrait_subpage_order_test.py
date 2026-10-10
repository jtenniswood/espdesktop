"""Compile the production subpage parser against saved portrait/landscape orders."""
from pathlib import Path
import re,subprocess,tempfile
root=Path(__file__).resolve().parents[2]
layout=(root/'components/espdesktop/button_grid_layout.h').read_text()
subpage=(root/'components/espdesktop/button_grid_subpages.h').read_text()
def function(name):
 m=re.search(r'^inline (?:bool|void) '+name+r'\([^;{]*\) \{\n.*?^\}',subpage,re.M|re.S)
 assert m,name
 return m.group()
order=re.search(r'struct OrderResult \{.*?\n\};',layout,re.S).group()
suborder=re.search(r'struct SubpageOrder \{.*?\n\};',subpage,re.S).group()
helpers=layout[layout.index('constexpr int CARD_SIZE_SINGLE_ROW_SPAN'):layout.index('// Saved layouts can originate')]
cpp='''#include <string>
#include <cstring>
#include <cctype>
#include <cassert>
constexpr int MAX_GRID_SLOTS=20;
int bounded_grid_slots(int n) { return n<0?0:(n>20?20:n); }
'''+order+helpers+suborder+function('subpage_back_token_span')+function('parse_subpage_order')+r'''
int main() {
 SubpageOrder portrait;
 parse_subpage_order("B,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,,,16,17",18,20,portrait,20);
 assert(portrait.has_back_token && portrait.back_pos==0);
 for(int i=1;i<18;++i) assert(portrait.positions[i]==i);
 SubpageOrder high;
 parse_subpage_order("B,,,,,,,,,,,,,,,,,,19w,20",18,20,high,20);
 assert(high.positions[1]==19 && high.positions[2]==20 && high.col_span[18]==2);
 SubpageOrder landscape;
 parse_subpage_order("B,,,,,,,,,,,,,,,,,,19w,20",20,20,landscape,20);
 assert(landscape.positions[18]==19 && landscape.positions[19]==20 && landscape.col_span[18]==2);
 SubpageOrder implicit;
 parse_subpage_order("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,,,16,17",18,20,implicit,20);
 assert(!implicit.has_back_token);
 for(int i=0;i<17;++i) assert(implicit.positions[i]==i+1);
 SubpageOrder tail_back;
 parse_subpage_order("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,,,Bw",18,20,tail_back,20);
 assert(tail_back.back_pos==17 && tail_back.back_col_span==2);
 for(int i=0;i<17;++i) assert(tail_back.positions[i]==i+1);
 SubpageOrder unchanged;
 parse_subpage_order("B,1,,,2",6,6,unchanged);
 assert(unchanged.positions[1]==1 && unchanged.positions[4]==2);
}
'''
with tempfile.TemporaryDirectory() as t:
 p=Path(t);(p/'test.cpp').write_text(cpp)
 subprocess.run(['c++','-std=c++17','-Wall','-Wextra','-Werror',str(p/'test.cpp'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
print('Production subpage portrait tail, high IDs, Back and landscape restoration passed.')
