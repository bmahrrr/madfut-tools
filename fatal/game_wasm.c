// FATAL My Club exact game solver.
//
// Rules: each side has 11 cards (attack, control, defence). Players alternate leading
// (5 leads each). The leader picks a card and a stat; the other side answers with one card:
// attack vs defence, defence vs attack, control vs control. Higher value wins the round;
// equal value -> higher tiebreak total wins; still equal -> no point. Every card is used once.
// After 10 rounds the two remaining cards decide a tiebreak if the score is level or 1 apart:
// a card whose total is more than 5 higher than the other wins one extra point.
//
// level(...) returns how well side A does with perfect play from both sides:
//   0 = A loses by 2+, 1 = A loses by 1, 2 = draw, 3 = A wins by 1, 4 = A wins by 2+.
// WebAssembly build of game.c for phones (same rules and search; the memo is a hash table, ~24 MB instead of ~770 MB).
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry -Wl,--export-dynamic -Wl,--initial-memory=33554432 -o docs/game.wasm fatal/game_wasm.c
typedef unsigned short uint16_t; typedef unsigned int uint32_t;
#define EXPORT __attribute__((visibility("default")))
void *memcpy(void *d, const void *s, unsigned long n){ char *a=d; const char *b=s; while (n--) *a++ = *b++; return d; }
void *memset(void *d, int c, unsigned long n){ char *a=d; while (n--) *a++ = (char)c; return d; }
#define N 11
static int SA[N][3], SB[N][3], TA[N], TB[N];
static int first;                 // 0 = A leads first, 1 = B leads first
#define HB 22
#define HSZ (1u<<HB)
static uint32_t hkey[HSZ]; static uint16_t hval[HSZ]; static uint16_t gen = 0;
static int THR;
static inline int pc(int x){ return __builtin_popcount(x); }
static inline int cmp(int x, int y){ return x > y ? 1 : (x < y ? -1 : 0); }
static const int ctr[3] = {2, 1, 0};   // attack<->defence, control<->control
static inline int duelA(int ai, int bi, int s, int aLeads){
    int va, vb;
    if (aLeads){ va = SA[ai][s]; vb = SB[bi][ctr[s]]; }
    else { vb = SB[bi][s]; va = SA[ai][ctr[s]]; }
    int c = cmp(va, vb); if (c) return c;
    return cmp(TA[ai], TB[bi]);
}
static int ordA[3][N], ordB[3][N], byTA[N], byTB[N];
// domA[i]: bitmask of A's cards that are no better than card i in every stat and in tiebreak total
// (exact copies count once, by index). The game is monotone in card strength, so when several cards
// give the same duel result, using the weakest one is always at least as good: the others are pruned.
static int domA[N], domB[N];
static void doms(int S[N][3], int*T, int*dom){
    for (int i=0;i<N;i++){ dom[i]=0; for (int j=0;j<N;j++){ if (j==i) continue;
        int le = S[j][0]<=S[i][0] && S[j][1]<=S[i][1] && S[j][2]<=S[i][2] && T[j]<=T[i];
        int eq = S[j][0]==S[i][0] && S[j][1]==S[i][1] && S[j][2]==S[i][2] && T[j]==T[i];
        if (le && (!eq || j<i)) dom[i] |= 1<<j; } }
}
// stable insertion sorts (11 items), same orders as the site's JavaScript solver
static void orders(int S[N][3], int*T, int ord[3][N], int*byT){
    for (int s=0; s<3; s++){ for (int i=0;i<N;i++){ int x=i, k=i;
        while (k>0){ int y=ord[s][k-1]; int c=S[x][s]-S[y][s]; if (!c) c=T[x]-T[y]; if (c>0){ ord[s][k]=y; k--; } else break; }
        ord[s][k]=x; } }
    for (int i=0;i<N;i++){ int x=i, k=i; while (k>0 && T[byT[k-1]]>T[x]){ byT[k]=byT[k-1]; k--; } byT[k]=x; }
}
static void bump(void){
    gen++;
    if (gen >= 32000){ for (uint32_t q=0;q<HSZ;q++) hval[q]=0; gen = 1; }
}
// memo: open addressing, entries from older searches count as empty (generation stamp)
static inline int mget(uint32_t key, int *hit){
    uint32_t h = (key * 2654435761u) >> (32-HB);
    for (int p=0; p<32; p++, h=(h+1)&(HSZ-1)){
        uint16_t v = hval[h]; if ((v>>1) != gen){ *hit = 0; return (int)h; }
        if (hkey[h] == key){ *hit = 1; return (int)h; }
    }
    *hit = 0; return (int)((key * 2654435761u) >> (32-HB));   // full here: overwrite
}
// can A force final (score difference after tiebreak) >= THR ?
static int win(int ma, int mb, int d, int ti){
    int k = pc(ma);
    if (k == 1){
        int ai = __builtin_ctz(ma), bi = __builtin_ctz(mb), D = d;
        if (D >= -1 && D <= 1){ int t = TA[ai]-TB[bi]; if (t > 5) D++; else if (t < -5) D--; }
        return D >= THR;
    }
    int rem = k-1;
    if (d-rem-1 >= THR) return 1;
    if (d+rem+1 < THR) return 0;
    uint32_t key = ((uint32_t)ti<<27) | ((uint32_t)ma<<16) | ((uint32_t)mb<<5) | (uint32_t)(d+11);
    int hit; int slot = mget(key, &hit); if (hit) return hval[slot] & 1;
    int n = N-k; int aLeads = ((n%2)==0) ? (first==0) : (first==1);
    int res;
    if (aLeads){
        res = 0;
        for (int s=0; s<3 && !res; s++) for (int oi=0; oi<N && !res; oi++){ int i=ordA[s][oi]; if(!(ma>>i&1)) continue;
            int ok = 1, rr[N], same[3] = {0,0,0};
            for (int j=0;j<N;j++) if (mb>>j&1){ rr[j] = duelA(i,j,s,1); same[rr[j]+1] |= 1<<j; }
            for (int pass=0; pass<2 && ok; pass++) for (int oj=0; oj<N; oj++){ int j=byTB[oj]; if(!(mb>>j&1)) continue;
                int r = rr[j]; if ((pass==0) != (r<0)) continue;
                if (domB[j] & same[r+1]) continue;      // a weaker B card gives the same result
                if (!win(ma&~(1<<i), mb&~(1<<j), d+r, ti)){ ok=0; break; }
            }
            if (ok) res = 1;
        }
    } else {
        res = 1;
        for (int s=0; s<3 && res; s++) for (int oj=0; oj<N && res; oj++){ int j=ordB[s][oj]; if(!(mb>>j&1)) continue;
            int ok = 0, rr[N], same[3] = {0,0,0};
            for (int i=0;i<N;i++) if (ma>>i&1){ rr[i] = duelA(i,j,s,0); same[rr[i]+1] |= 1<<i; }
            for (int pass=0; pass<2 && !ok; pass++) for (int oi=0; oi<N; oi++){ int i=byTA[oi]; if(!(ma>>i&1)) continue;
                int r = rr[i]; if ((pass==0) != (r>0)) continue;
                if (domA[i] & same[r+1]) continue;      // a weaker A card gives the same result
                if (win(ma&~(1<<i), mb&~(1<<j), d+r, ti)){ ok=1; break; }
            }
            if (!ok) res = 0;
        }
    }
    { int h2; int sl = mget(key, &h2); hkey[sl] = key; hval[sl] = (uint16_t)((gen<<1) | res); } return res;
}
// a, b: 33 ints (A,C,D per card); ta, tb: 11 tiebreak totals
static void setup(int f, const int*a, const int*b, const int*ta, const int*tb){
    first = f;
    for (int i=0;i<N;i++){
        for (int s=0;s<3;s++){ SA[i][s]=a[3*i+s]; SB[i][s]=b[3*i+s]; }
        TA[i]=ta[i]; TB[i]=tb[i];
    }
    bump(); orders(SA,TA,ordA,byTA); orders(SB,TB,ordB,byTB); doms(SA,TA,domA); doms(SB,TB,domB);
}
static int level(int ma, int mb, int d){
    int l = 0;
    for (int t=-1; t<=2; t++){ THR=t; if (win(ma,mb,d,t+1)) l++; else break; }
    return l;
}
static int game(int f, const int*a, const int*b, const int*ta, const int*tb){
    setup(f,a,b,ta,tb); return level((1<<N)-1, (1<<N)-1, 0);
}
// Only the result for A (-1 loss, 0 draw, 1 win), not the margin: at most two searches instead of four.
static int outcome(int f, const int*a, const int*b, const int*ta, const int*tb){
    setup(f,a,b,ta,tb);
    int full = (1<<N)-1;
    THR = 0; if (!win(full, full, 0, 1)) return -1;
    THR = 1; return win(full, full, 0, 2) ? 1 : 0;
}
// Exact final score difference for A (perfect play from both sides), by binary search on the threshold.
// Used as a finer search signal than win/draw/loss (a loss by 1 is closer to a draw than a loss by 4).
static int margin(int f, const int*a, const int*b, const int*ta, const int*tb){
    setup(f,a,b,ta,tb);
    int full = (1<<N)-1, lo = -12, hi = 12;     // A can force >= lo, cannot force >= hi
    THR = 1; if (win(full, full, 0, 2)) lo = 1; else hi = 1;
    if (lo == -12){ THR = 0; if (win(full, full, 0, 1)) lo = 0; else hi = 0; }
    int t = 0;
    while (hi - lo > 1){
        int m = (lo + hi) >> 1; if (m == lo) m++;
        bump(); THR = m; if (win(full, full, 0, 3)) lo = m; else hi = m; t++;
    }
    return lo;
}

// JavaScript writes A (33), B (33), TA (11), TB (11) into IN, then calls one of these.
static int IN[88];
EXPORT int *inbuf(void){ return IN; }
EXPORT int run_level(int f){ return game(f, IN, IN+33, IN+66, IN+77); }
EXPORT int run_outcome(int f){ return outcome(f, IN, IN+33, IN+66, IN+77); }
EXPORT int run_margin(int f){ return margin(f, IN, IN+33, IN+66, IN+77); }
