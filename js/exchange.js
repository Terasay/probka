const currencies = [ 
  { id: 'GOLD', name: 'Золото', rate: 1.0 },
  { id: 'GEM', name: 'Камни', rate: 0.025 },
  { id: 'WOOD', name: 'Древесина', rate: 0.0023 },
  { id: 'IRON', name: 'Железо', rate: 0.0045 }
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

const fromSel = document.getElementById("from");
const toSel = document.getElementById("to");
const chartSel = document.getElementById("chartCurrency");

function populateSelects() {
  currencies.forEach(c => {
    const opt = `<option value="${c.id}">${c.name} (${c.id})</option>`;
    fromSel.insertAdjacentHTML("beforeend", opt);
    toSel.insertAdjacentHTML("beforeend", opt);
    chartSel.insertAdjacentHTML("beforeend", opt);
  });
  fromSel.value = "GOLD";
  toSel.value = "GEM";
  chartSel.value = "GEM";
}

document.getElementById("convert").addEventListener("click", () => {
  const amount = parseFloat(document.getElementById("amount").value) || 0;
  const from = currencies.find(c => c.id === fromSel.value);
  const to = currencies.find(c => c.id === toSel.value);

  const valueInBase = amount * from.rate;
  const result = valueInBase / to.rate;
  document.getElementById("converted").innerText =
    `${amount} ${from.id} = ${result.toFixed(4)} ${to.id}`;
});

const ctx = document.getElementById("priceChart").getContext("2d");
let chart;

function getVar(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function drawChart(currencyId) {
  const data = [];
  let value = currencies.find(c => c.id === currencyId).rate;
  for (let i = 0; i < 30; i++) {
    value += (Math.random() - 0.5) * value * 0.05;
    data.push(value.toFixed(4));
  }

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: Array.from({ length: 30 }, (_, i) => i + 1),
      datasets: [{
        label: currencyId,
        data,
        borderColor: getVar('--chart-line'),
        borderWidth: 2,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: getVar('--text')
          }
        }
      },
      scales: {
        x: {
          ticks: { color: getVar('--muted') },
          grid: { color: getVar('--table-border') }
        },
        y: {
          ticks: { color: getVar('--muted') },
          grid: { color: getVar('--table-border') }
        }
      }
    }
  });
}

chartSel.addEventListener("change", () => drawChart(chartSel.value));

const themeLink = document.getElementById("theme-link");
if (themeLink) {
  const observer = new MutationObserver(() => {
    drawChart(chartSel.value);
  });
  observer.observe(themeLink, { attributes: true, attributeFilter: ['href'] });
}

renderRates();
populateSelects();

window.addEventListener("load", () => {
  drawChart(chartSel.value);
});
