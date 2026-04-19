import { describe, expect, it } from "vitest";
import { splitDsv } from "./splitDsv.js";

describe("splitDsv", () => {
  it("should split a long line and detect delimiters", () => {
    const line = `"EPCI","Commune","Numéro d'immatriculation","Date d'immatriculation","Date de la dernière MAJ","Type de syndic : bénévole / professionnel / non connu","Identification du représentant légal  (raison sociale et le numéro SIRET du syndic professionnel ou Civilité/prénom/ nom du syndic bénévole ou coopératif)","SIRET du représentant légal","Code APE","Commune du représentant légal","Mandat en cours dans la copropriété","Date de fin du dernier mandat","Nom d’usage de la copropriété","Adresse de référence","Numéro et Voie (adresse de référence)","Code postal (adresse de référence)","Commune (adresse de référence)","Adresse complémentaire 1","Adresse complémentaire 2","Adresse complémentaire 3","Nombre d'adresses complémentaires","long","lat","Date du règlement de copropriété","Résidence service","Syndicat coopératif","Syndicat principal ou syndicat secondaire","Si secondaire, n° d’immatriculation du principal","Nombre d’ASL auxquelles est rattaché le syndicat de copropriétaires","Nombre d’AFUL auxquelles est rattaché le syndicat de copropriétaires","Nombre d’Unions de syndicats auxquelles est rattaché le syndicat de copropriétaires","Nombre total de lots","Nombre total de lots à usage d’habitation, de bureaux ou de commerces","Nombre de lots à usage d’habitation","Nombre de lots de stationnement","Nombre d'arrêtés relevant du code de la santé publique en cours","Nombre d'arrêtés de péril sur les parties communes en cours","Nombre d'arrêtés sur les équipements communs en cours","Période de construction","Référence Cadastrale 1","Code INSEE commune 1","Préfixe 1","Section 1","Numéro parcelle 1","Référence Cadastrale 2","Code INSEE commune 2","Préfixe 2","Section 2","Numéro parcelle 2","Référence Cadastrale 3","Code INSEE commune 3","Préfixe 3","Section 3","Numéro parcelle 3","Nombre de parcelles cadastrales","nom_qp_2015","code_qp_2015","nom_qp_2024","code_qp_2024","Copro dans ACV","Copro dans PVD","Copro aidée","Code Officiel Commune","Nom Officiel Commune","Code Officiel Arrondissement Commune","Nom Officiel Arrondissement Commune","Code Officiel EPCI","Nom Officiel EPCI","Code Officiel Département","Nom Officiel Département","Code Officiel Région","Nom Officiel Région"`;
    const result = splitDsv(line);
    expect(result.delimiter).toBe(",");
  });
  it("should be able to get delimiter from empty line", async () => {
    expect(splitDsv(",,")).toEqual({
      values: ["", "", ""],
      delimiter: ",",
    });
    expect(splitDsv(":;")).toEqual({
      values: [":", ""],
      delimiter: ";",
    });
  });
  it("should be able to split non-quoted CSV line and extract delimiter ", async () => {
    expect(splitDsv("a,b,c")).toEqual({
      values: ["a", "b", "c"],
      delimiter: ",",
    });
    expect(splitDsv("a;b;c")).toEqual({
      values: ["a", "b", "c"],
      delimiter: ";",
    });
    expect(splitDsv(" a , b , c ")).toEqual({
      values: [" a ", " b ", " c "],
      delimiter: ",",
    });
    expect(splitDsv(" a | b | c ")).toEqual({
      values: [" a ", " b ", " c "],
      delimiter: "|",
    });
  });

  it("should be able to split quoted CSV line and extract delimiter ", async () => {
    expect(splitDsv("'a','b','c'")).toEqual({
      values: ["a", "b", "c"],
      delimiter: ",",
    });
    expect(splitDsv('"a";"b";"c"')).toEqual({
      values: ["a", "b", "c"],
      delimiter: ";",
    });
    expect(splitDsv("' a ',' b ',' c '")).toEqual({
      values: [" a ", " b ", " c "],
      delimiter: ",",
    });
    expect(splitDsv("' a '|' b '|' c '")).toEqual({
      values: [" a ", " b ", " c "],
      delimiter: "|",
    });
  });

  it("should be able to split quoted and non-quote CSV line and extract delimiter ", async () => {
    expect(splitDsv("'  a  ',  b  ,\"  c  \" ")).toEqual({
      values: ["  a  ", "  b  ", "  c  "],
      delimiter: ",",
    });
    expect(splitDsv("' \" a \" ', ' b  ' ,\" ' c ' \" ")).toEqual({
      values: [' " a " ', " ' b  ' ", " ' c ' "],
      delimiter: ",",
    });
  });

  it("should parse escaped characters ", async () => {
    expect(
      splitDsv(JSON.stringify(JSON.stringify({ message: "Hello", id: 123 }))),
    ).toEqual({
      values: [JSON.stringify({ message: "Hello", id: 123 })],
      delimiter: undefined,
    });
  });
});
