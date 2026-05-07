import { create } from 'zustand'

export const useEcosystemStore = create((set) => ({
  calendar:      null,
  heartRate:     null,
  sleepHours:    null,
  stressLevel:   null,
  socialBattery: null,
  temperature:   null,
  fuelLevel:     null,
  location:      null,
  spotifyGenre:  null,
  hour:          null,

  updateEcosystem: (data) => set(data),
}))
