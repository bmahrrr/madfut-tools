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
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#define N 11
static int SA[N][3], SB[N][3], TA[N], TB[N];
static int first;                 // 0 = A leads first, 1 = B leads first
static uint16_t *memo[4]; static uint16_t gen = 0;
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
static int (*CS)[3]; static int *CT; static int cs_s;
static int qs_desc(const void*a, const void*b){ int x=*(int*)a, y=*(int*)b; int c=CS[y][cs_s]-CS[x][cs_s]; if(c) return c; return CT[y]-CT[x]; }
static int qs_asc(const void*a, const void*b){ int x=*(int*)a, y=*(int*)b; return CT[x]-CT[y]; }
static void orders(int S[N][3], int*T, int ord[3][N], int*byT){
    CS = S; CT = T;
    for (int s=0; s<3; s++){ for (int i=0;i<N;i++) ord[s][i]=i; cs_s=s; qsort(ord[s],N,sizeof(int),qs_desc); }
    for (int i=0;i<N;i++) byT[i]=i; qsort(byT,N,sizeof(int),qs_asc);
}
static const long SZ = (1L<<22) * 23;
static void bump(void){
    if (!memo[0]){ for (int q=0;q<4;q++) memo[q] = calloc(SZ, sizeof(uint16_t)); gen = 0; }
    gen++;
    if (gen >= 32000){ for (int q=0;q<4;q++) memset(memo[q], 0, SZ*sizeof(uint16_t)); gen = 1; }
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
    long idx = ((long)ma<<11 | mb) * 23 + (d+11);
    uint16_t m = memo[ti][idx]; if ((m>>1) == gen) return m & 1;
    int n = N-k; int aLeads = ((n%2)==0) ? (first==0) : (first==1);
    int res;
    if (aLeads){
        res = 0;
        for (int s=0; s<3 && !res; s++) for (int oi=0; oi<N && !res; oi++){ int i=ordA[s][oi]; if(!(ma>>i&1)) continue;
            int ok = 1;
            for (int pass=0; pass<2 && ok; pass++) for (int oj=0; oj<N; oj++){ int j=byTB[oj]; if(!(mb>>j&1)) continue;
                int r = duelA(i,j,s,1); if ((pass==0) != (r<0)) continue;
                if (!win(ma&~(1<<i), mb&~(1<<j), d+r, ti)){ ok=0; break; }
            }
            if (ok) res = 1;
        }
    } else {
        res = 1;
        for (int s=0; s<3 && res; s++) for (int oj=0; oj<N && res; oj++){ int j=ordB[s][oj]; if(!(mb>>j&1)) continue;
            int ok = 0;
            for (int pass=0; pass<2 && !ok; pass++) for (int oi=0; oi<N; oi++){ int i=byTA[oi]; if(!(ma>>i&1)) continue;
                int r = duelA(i,j,s,0); if ((pass==0) != (r>0)) continue;
                if (win(ma&~(1<<i), mb&~(1<<j), d+r, ti)){ ok=1; break; }
            }
            if (!ok) res = 0;
        }
    }
    memo[ti][idx] = (uint16_t)((gen<<1) | res); return res;
}
// a, b: 33 ints (A,C,D per card); ta, tb: 11 tiebreak totals
void setup(int f, const int*a, const int*b, const int*ta, const int*tb){
    first = f;
    for (int i=0;i<N;i++){
        for (int s=0;s<3;s++){ SA[i][s]=a[3*i+s]; SB[i][s]=b[3*i+s]; }
        TA[i]=ta[i]; TB[i]=tb[i];
    }
    bump(); orders(SA,TA,ordA,byTA); orders(SB,TB,ordB,byTB);
}
int level(int ma, int mb, int d){
    int l = 0;
    for (int t=-1; t<=2; t++){ THR=t; if (win(ma,mb,d,t+1)) l++; else break; }
    return l;
}
int duelres(int ai, int bi, int s, int aLeads){ return duelA(ai,bi,s,aLeads); }
int game(int f, const int*a, const int*b, const int*ta, const int*tb){
    setup(f,a,b,ta,tb); return level((1<<N)-1, (1<<N)-1, 0);
}
