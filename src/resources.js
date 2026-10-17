const videoIds = [
  "D7D8IrtObMI",
  "fbWU-8y_b5M",
  "jF6UbOpUQfY",
  "_XKPiNG4ZkY",
  "lS-dWt26fHw",
  "e8t5oLUBgUk",
  "ylT01vuvFXQ",
  "kwZ-Q6_Rkyo",
  "Wp-Vy7R7alE",
  "dpWF9LR5rDA",
  "7kQwJ_ZAHsE",
  "-WoXdY3voy4",
  "9zuknPw1LgY",
  "aX40M_L6BL0",
  "CcT_k_HjYCo",
  "F74kHsLRR_I",
  "0IFTl23F5SI",
  "md9uzIxjRWA",
  "FbBBsuUqr4g",
  "h2EpUubVSPA",
  "GISO5AKqah4",
  "q3SqeG1AWWI",
  "FyiE3k--hVE",
  "RkvWMwH_Suo",
  "Rs1L5XUplq8",
  "c0DZ9SX_x3w",
  "HVyCHv4YCXc",
  "po9jZu0Xuas",
  "7kZHkhaFeHc",
  "QRnO29MRw_I",
  "ZlcUD0-zQhk",
  "1HLQMplhFy0",
  "vSJv0RFtuv8",
  "6xwPC4T_m4c",
  "LnGJA02es1Y",
  "cWqmE5sc_cU",
  "ZFoEf_Yrp88",
  "j0Rmqx0r35I",
  "Km-gbCGu86I",
  "z1wtRc9kz0U",
  "cHplA6Vdhm0",
  "dT0ozRF_3BU",
  "icvF1gqDgY4",
  "O2z-sQWaM3k",
  "VUb0vMzw35c",
  "F2Dn8a5K-ts",
  "8rASGjYVNh8",
  "WRf1tj2puMA"
];

export const videos = [...videoIds].reverse().map((id, index) => ({
  id,
  type: "video",
  title: `Course ${String(index + 1).padStart(2, "0")}`,
  url: `https://www.youtube.com/watch?v=${id}`
}));

export const resources = [
  {
    type: "code",
    title: "React States",
    id: "github.com/evangadi/react-states",
    url: "https://github.com/evangadi/react-states"
  },
  ...videos
];
