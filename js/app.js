const currencies = [
  {id:'GOLD', name:'Золото', rate:1.0},
  {id:'GEM', name:'Камни', rate:0.025},
  {id:'WOOD', name:'Древесина', rate:0.0023}
];

const tbody = document.querySelector("#ratesTable tbody");

function renderRates() {
  tbody.innerHTML = "";
  currencies.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${c.name}</td><td>${c.id}</td><td>${c.rate.toFixed(4)}</td>`;
    tbody.appendChild(tr);
  });
}

renderRates();
