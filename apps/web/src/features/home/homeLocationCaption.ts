/** Paridade com apps/mobile/lib/features/home/home_visual.dart */
export function homeLocationCaption(params: {
  displayedCity: string
  displayedUf: string
  profileCity: string
  profileUf: string
}): string | null {
  const city = params.displayedCity.trim()
  const uf = params.displayedUf.trim()
  if (city.length === 0 || city === 'Sua cidade') return null
  const sameCity =
    city.toLowerCase() === params.profileCity.trim().toLowerCase() &&
    uf.toLowerCase() === params.profileUf.trim().toLowerCase() &&
    params.profileCity.trim().length > 0
  if (sameCity) return 'Sua cidade'
  return 'Cidade selecionada'
}
